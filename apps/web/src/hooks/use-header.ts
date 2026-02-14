import { atom, useAtom } from "jotai";

const headerHeightAtom = atom(0);

export function useHeader() {
  const [headerHeight, setHeaderHeight] = useAtom(headerHeightAtom);
  return { headerHeight, setHeaderHeight };
}
