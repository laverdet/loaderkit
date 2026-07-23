import { registerHooks } from "node:module";
import { load, resolve } from "./loader.js";

registerHooks({ load, resolve });
