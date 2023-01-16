import { Schema, MapSchema, type } from "@colyseus/schema";

export enum TeamType {
    Mafia = "mafia",
    Citizen = "citizen",
}

export enum RoleType {
    Mafia = "Mafia",
    Citizen = "Citizen",
    Doctor = "Dotor",
    Police = "Police",
}

export class Role extends Schema {
    @type("string") team: TeamType;
    @type("string") type: RoleType;
    @type("string") name: string;
    @type("string") description: string;

    onBeginDay() {}

    onEndDay() {}

    onBeginNight() {}

    onEndNight() {}
}

export function getRole(type: RoleType) {
    switch (type) {
        case RoleType.Mafia:
            return new Mafia();
        case RoleType.Citizen:
            return new Citizen();
    }
}

export class Mafia extends Role {
    team = TeamType.Mafia;
    type = RoleType.Mafia;
    name = "마피아";
    description = "마피아임";
}

export class Citizen extends Role {
    team = TeamType.Citizen;
    type = RoleType.Citizen;
    name = "시민";
    description = "시민임";
}
