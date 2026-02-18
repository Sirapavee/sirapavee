import { type ThreeElement } from "@react-three/fiber";

declare module "@react-three/fiber" {
  interface ThreeElements {
    customElement: ThreeElement<typeof CustomElement>;
  }
}

extend({ CustomElement });
