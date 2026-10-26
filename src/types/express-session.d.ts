import "express-session";
import { Usuario } from "../models/Usuario";

declare module "express-session" {
    interface SessionData {
        user?: Usuario;
    }
}