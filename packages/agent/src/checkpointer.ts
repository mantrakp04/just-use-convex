import type { RunnableConfig } from "@langchain/core/runnables";
import {
  BaseCheckpointSaver,
  type Checkpoint,
  type CheckpointListOptions,
  type CheckpointTuple,
  type SerializerProtocol,
  type PendingWrite,
  type CheckpointMetadata,
  TASKS,
  copyCheckpoint,
  maxChannelVersion,
} from "@langchain/langgraph-checkpoint";

interface CheckpointRow {
  checkpoint: string;
  metadata: string;
  parent_checkpoint_id?: string;
  thread_id: string;
  checkpoint_id: string;
  checkpoint_ns?: string;
  type?: string;
  pending_writes: string;
  pending_sends?: string;
}

interface PendingWriteColumn {
  task_id: string;
  channel: string;
  type: string;
  value: string;
}

interface PendingSendColumn {
  type: string;
  value: string;
}

// Cloudflare DO SQL interface
export interface CloudflareSqlStorage {
  exec<T = unknown>(sql: string, ...bindings: unknown[]): { toArray: () => T[] };
}

// Valid metadata keys for filtering
const validCheckpointMetadataKeys = ["source", "step", "parents"] as const;

// Simple JSON serializer for Cloudflare DO
const jsonSerializer: SerializerProtocol = {
  async dumpsTyped(data: unknown): Promise<[string, Uint8Array]> {
    const json = JSON.stringify(data);
    return ["json", new TextEncoder().encode(json)];
  },
  async loadsTyped(_type: string, data: Uint8Array | string): Promise<unknown> {
    const str = typeof data === "string" ? data : new TextDecoder().decode(data);
    if (!str || str === "undefined") return undefined;
    try {
      return JSON.parse(str);
    } catch {
      return str;
    }
  },
};

export class CloudflareDOCheckpointer extends BaseCheckpointSaver {
  private sql: CloudflareSqlStorage;
  protected isSetup: boolean = false;
  declare serde: SerializerProtocol;

  constructor(sql: CloudflareSqlStorage, serde?: SerializerProtocol) {
    super(serde ?? jsonSerializer);
    this.sql = sql;
  }

  override getNextVersion(current: number | undefined): number {
    return current === undefined ? 1 : current + 1;
  }

  protected setup(): void {
    if (this.isSetup) {
      return;
    }

    this.sql.exec(`
CREATE TABLE IF NOT EXISTS checkpoints (
  thread_id TEXT NOT NULL,
  checkpoint_ns TEXT NOT NULL DEFAULT '',
  checkpoint_id TEXT NOT NULL,
  parent_checkpoint_id TEXT,
  type TEXT,
  checkpoint BLOB,
  metadata BLOB,
  PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id)
)`);
    this.sql.exec(`
CREATE TABLE IF NOT EXISTS writes (
  thread_id TEXT NOT NULL,
  checkpoint_ns TEXT NOT NULL DEFAULT '',
  checkpoint_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  idx INTEGER NOT NULL,
  channel TEXT NOT NULL,
  type TEXT,
  value BLOB,
  PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id, task_id, idx)
)`);

    this.isSetup = true;
  }

  async getTuple(config: RunnableConfig): Promise<CheckpointTuple | undefined> {
    this.setup();
    const {
      thread_id,
      checkpoint_ns = "",
      checkpoint_id,
    } = config.configurable ?? {};

    let row: CheckpointRow | undefined;

    if (checkpoint_id) {
      const sql = `
  SELECT
    thread_id,
    checkpoint_ns,
    checkpoint_id,
    parent_checkpoint_id,
    type,
    checkpoint,
    metadata,
    (
      SELECT
        json_group_array(
          json_object(
            'task_id', pw.task_id,
            'channel', pw.channel,
            'type', pw.type,
            'value', CAST(pw.value AS TEXT)
          )
        )
      FROM writes as pw
      WHERE pw.thread_id = checkpoints.thread_id
        AND pw.checkpoint_ns = checkpoints.checkpoint_ns
        AND pw.checkpoint_id = checkpoints.checkpoint_id
    ) as pending_writes,
    (
      SELECT
        json_group_array(
          json_object(
            'type', ps.type,
            'value', CAST(ps.value AS TEXT)
          )
        )
      FROM writes as ps
      WHERE ps.thread_id = checkpoints.thread_id
        AND ps.checkpoint_ns = checkpoints.checkpoint_ns
        AND ps.checkpoint_id = checkpoints.parent_checkpoint_id
        AND ps.channel = '${TASKS}'
      ORDER BY ps.idx
    ) as pending_sends
  FROM checkpoints
  WHERE thread_id = ? AND checkpoint_ns = ? AND checkpoint_id = ?`;
      const rows = this.sql.exec<CheckpointRow>(sql, thread_id, checkpoint_ns, checkpoint_id).toArray();
      row = rows[0];
    } else {
      const sql = `
  SELECT
    thread_id,
    checkpoint_ns,
    checkpoint_id,
    parent_checkpoint_id,
    type,
    checkpoint,
    metadata,
    (
      SELECT
        json_group_array(
          json_object(
            'task_id', pw.task_id,
            'channel', pw.channel,
            'type', pw.type,
            'value', CAST(pw.value AS TEXT)
          )
        )
      FROM writes as pw
      WHERE pw.thread_id = checkpoints.thread_id
        AND pw.checkpoint_ns = checkpoints.checkpoint_ns
        AND pw.checkpoint_id = checkpoints.checkpoint_id
    ) as pending_writes,
    (
      SELECT
        json_group_array(
          json_object(
            'type', ps.type,
            'value', CAST(ps.value AS TEXT)
          )
        )
      FROM writes as ps
      WHERE ps.thread_id = checkpoints.thread_id
        AND ps.checkpoint_ns = checkpoints.checkpoint_ns
        AND ps.checkpoint_id = checkpoints.parent_checkpoint_id
        AND ps.channel = '${TASKS}'
      ORDER BY ps.idx
    ) as pending_sends
  FROM checkpoints
  WHERE thread_id = ? AND checkpoint_ns = ?
  ORDER BY checkpoint_id DESC LIMIT 1`;
      const rows = this.sql.exec<CheckpointRow>(sql, thread_id, checkpoint_ns).toArray();
      row = rows[0];
    }

    if (row === undefined) return undefined;

    let finalConfig = config;

    if (!checkpoint_id) {
      finalConfig = {
        configurable: {
          thread_id: row.thread_id,
          checkpoint_ns,
          checkpoint_id: row.checkpoint_id,
        },
      };
    }

    if (
      finalConfig.configurable?.thread_id === undefined ||
      finalConfig.configurable?.checkpoint_id === undefined
    ) {
      throw new Error("Missing thread_id or checkpoint_id");
    }

    const pendingWrites = await Promise.all(
      (JSON.parse(row.pending_writes) as PendingWriteColumn[]).map(
        async (write) => {
          return [
            write.task_id,
            write.channel,
            await this.serde.loadsTyped(
              write.type ?? "json",
              write.value ?? ""
            ),
          ] as [string, string, unknown];
        }
      )
    );

    const checkpoint = (await this.serde.loadsTyped(
      row.type ?? "json",
      row.checkpoint
    )) as Checkpoint;

    if (checkpoint.v < 4 && row.parent_checkpoint_id != null) {
      await this.migratePendingSends(
        checkpoint,
        row.thread_id,
        row.parent_checkpoint_id
      );
    }

    return {
      checkpoint,
      config: finalConfig,
      metadata: (await this.serde.loadsTyped(
        row.type ?? "json",
        row.metadata
      )) as CheckpointMetadata,
      parentConfig: row.parent_checkpoint_id
        ? {
            configurable: {
              thread_id: row.thread_id,
              checkpoint_ns,
              checkpoint_id: row.parent_checkpoint_id,
            },
          }
        : undefined,
      pendingWrites,
    };
  }

  async *list(
    config: RunnableConfig,
    options?: CheckpointListOptions
  ): AsyncGenerator<CheckpointTuple> {
    const { limit, before, filter } = options ?? {};
    this.setup();
    const thread_id = config.configurable?.thread_id;
    const checkpoint_ns = config.configurable?.checkpoint_ns;
    let sql = `
      SELECT
        thread_id,
        checkpoint_ns,
        checkpoint_id,
        parent_checkpoint_id,
        type,
        checkpoint,
        metadata,
        (
          SELECT
            json_group_array(
              json_object(
                'task_id', pw.task_id,
                'channel', pw.channel,
                'type', pw.type,
                'value', CAST(pw.value AS TEXT)
              )
            )
          FROM writes as pw
          WHERE pw.thread_id = checkpoints.thread_id
            AND pw.checkpoint_ns = checkpoints.checkpoint_ns
            AND pw.checkpoint_id = checkpoints.checkpoint_id
        ) as pending_writes,
        (
          SELECT
            json_group_array(
              json_object(
                'type', ps.type,
                'value', CAST(ps.value AS TEXT)
              )
            )
          FROM writes as ps
          WHERE ps.thread_id = checkpoints.thread_id
            AND ps.checkpoint_ns = checkpoints.checkpoint_ns
            AND ps.checkpoint_id = checkpoints.parent_checkpoint_id
            AND ps.channel = '${TASKS}'
          ORDER BY ps.idx
        ) as pending_sends
      FROM checkpoints\n`;

    const whereClause: string[] = [];
    const args: unknown[] = [];

    if (thread_id) {
      whereClause.push("thread_id = ?");
      args.push(thread_id);
    }

    if (checkpoint_ns !== undefined && checkpoint_ns !== null) {
      whereClause.push("checkpoint_ns = ?");
      args.push(checkpoint_ns);
    }

    if (before?.configurable?.checkpoint_id !== undefined) {
      whereClause.push("checkpoint_id < ?");
      args.push(before.configurable.checkpoint_id);
    }

    const sanitizedFilter = Object.fromEntries(
      Object.entries(filter ?? {}).filter(
        ([key, value]) =>
          value !== undefined &&
          (validCheckpointMetadataKeys as readonly string[]).includes(key)
      )
    );

    whereClause.push(
      ...Object.entries(sanitizedFilter).map(
        ([key]) => `json_extract(CAST(metadata AS TEXT), '$.${key}') = ?`
      )
    );
    args.push(...Object.values(sanitizedFilter).map((value) => JSON.stringify(value)));

    if (whereClause.length > 0) {
      sql += `WHERE\n  ${whereClause.join(" AND\n  ")}\n`;
    }

    sql += "\nORDER BY checkpoint_id DESC";

    if (limit) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sql += ` LIMIT ${parseInt(limit as any, 10)}`; // parseInt here (with cast to make TS happy) to sanitize input, as limit may be user-provided
    }

    const rows = this.sql.exec<CheckpointRow>(sql, ...args).toArray();

    if (rows) {
      for (const row of rows) {
        const pendingWrites = await Promise.all(
          (JSON.parse(row.pending_writes) as PendingWriteColumn[]).map(
            async (write) => {
              return [
                write.task_id,
                write.channel,
                await this.serde.loadsTyped(
                  write.type ?? "json",
                  write.value ?? ""
                ),
              ] as [string, string, unknown];
            }
          )
        );

        const checkpoint = (await this.serde.loadsTyped(
          row.type ?? "json",
          row.checkpoint
        )) as Checkpoint;

        if (checkpoint.v < 4 && row.parent_checkpoint_id != null) {
          await this.migratePendingSends(
            checkpoint,
            row.thread_id,
            row.parent_checkpoint_id
          );
        }

        yield {
          config: {
            configurable: {
              thread_id: row.thread_id,
              checkpoint_ns: row.checkpoint_ns,
              checkpoint_id: row.checkpoint_id,
            },
          },
          checkpoint,
          metadata: (await this.serde.loadsTyped(
            row.type ?? "json",
            row.metadata
          )) as CheckpointMetadata,
          parentConfig: row.parent_checkpoint_id
            ? {
                configurable: {
                  thread_id: row.thread_id,
                  checkpoint_ns: row.checkpoint_ns,
                  checkpoint_id: row.parent_checkpoint_id,
                },
              }
            : undefined,
          pendingWrites,
        };
      }
    }
  }

  async put(
    config: RunnableConfig,
    checkpoint: Checkpoint,
    metadata: CheckpointMetadata
  ): Promise<RunnableConfig> {
    this.setup();

    if (!config.configurable) {
      throw new Error("Empty configuration supplied.");
    }

    const thread_id = config.configurable?.thread_id;
    const checkpoint_ns = config.configurable?.checkpoint_ns ?? "";
    const parent_checkpoint_id = config.configurable?.checkpoint_id;

    if (!thread_id) {
      throw new Error(
        `Missing "thread_id" field in passed "config.configurable".`
      );
    }

    const preparedCheckpoint: Partial<Checkpoint> = copyCheckpoint(checkpoint);

    const [[type1, serializedCheckpoint], [type2, serializedMetadata]] =
      await Promise.all([
        this.serde.dumpsTyped(preparedCheckpoint),
        this.serde.dumpsTyped(metadata),
      ]);

    if (type1 !== type2) {
      throw new Error(
        "Failed to serialized checkpoint and metadata to the same type."
      );
    }

    this.sql.exec(
      `INSERT OR REPLACE INTO checkpoints (thread_id, checkpoint_ns, checkpoint_id, parent_checkpoint_id, type, checkpoint, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      thread_id,
      checkpoint_ns,
      checkpoint.id,
      parent_checkpoint_id ?? null,
      type1,
      serializedCheckpoint,
      serializedMetadata
    );

    return {
      configurable: {
        thread_id,
        checkpoint_ns,
        checkpoint_id: checkpoint.id,
      },
    };
  }

  async putWrites(
    config: RunnableConfig,
    writes: PendingWrite[],
    taskId: string
  ): Promise<void> {
    this.setup();

    if (!config.configurable) {
      throw new Error("Empty configuration supplied.");
    }

    if (!config.configurable?.thread_id) {
      throw new Error("Missing thread_id field in config.configurable.");
    }

    if (!config.configurable?.checkpoint_id) {
      throw new Error("Missing checkpoint_id field in config.configurable.");
    }

    for (let idx = 0; idx < writes.length; idx++) {
      const write = writes[idx];
      const [type, serializedWrite] = await this.serde.dumpsTyped(write?.[1] ?? {});
      this.sql.exec(
        `INSERT OR REPLACE INTO writes
        (thread_id, checkpoint_ns, checkpoint_id, task_id, idx, channel, type, value)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        config.configurable.thread_id,
        config.configurable.checkpoint_ns ?? "",
        config.configurable.checkpoint_id,
        taskId,
        idx,
        write?.[0] ?? "",
        type,
        serializedWrite
      );
    }
  }

  async deleteThread(threadId: string) {
    this.sql.exec(`DELETE FROM checkpoints WHERE thread_id = ?`, threadId);
    this.sql.exec(`DELETE FROM writes WHERE thread_id = ?`, threadId);
  }

  protected async migratePendingSends(
    checkpoint: Checkpoint,
    threadId: string,
    parentCheckpointId: string
  ) {
    const rows = this.sql.exec<{ pending_sends: string }>(
      `
        SELECT
          checkpoint_id,
          json_group_array(
            json_object(
              'type', ps.type,
              'value', CAST(ps.value AS TEXT)
            )
          ) as pending_sends
        FROM writes as ps
        WHERE ps.thread_id = ?
          AND ps.checkpoint_id = ?
          AND ps.channel = '${TASKS}'
        ORDER BY ps.idx
      `,
      threadId,
      parentCheckpointId
    ).toArray();

    const { pending_sends } = rows[0] ?? { pending_sends: "[]" };

    const mutableCheckpoint = checkpoint;

    // add pending sends to checkpoint
    mutableCheckpoint.channel_values ??= {};
    mutableCheckpoint.channel_values[TASKS] = await Promise.all(
      JSON.parse(pending_sends).map(({ type, value }: PendingSendColumn) =>
        this.serde.loadsTyped(type, value)
      )
    );

    // add to versions
    mutableCheckpoint.channel_versions[TASKS] =
      Object.keys(checkpoint.channel_versions).length > 0
        ? maxChannelVersion(...Object.values(checkpoint.channel_versions))
        : this.getNextVersion(undefined);
  }
}
