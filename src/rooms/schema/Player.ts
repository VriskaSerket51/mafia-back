import { Schema, MapSchema, type } from "@colyseus/schema";
import { Role } from "./Role";

export class Player extends Schema {
    @type("string") id: string;
    @type("string") name: string;
    role?: Role;
    @type("boolean") isAlive: boolean = true;
    hasVoteTicket: boolean = false;
    hasTimerTicket: boolean = false;
}
