import betterAuth from "./betterAuth/convex.config"; 
import { defineApp } from "convex/server";

const app = defineApp();
app.use(betterAuth);

export default app;
