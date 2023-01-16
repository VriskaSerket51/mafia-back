import { Schema, MapSchema, type } from "@colyseus/schema";
import { getElCount } from "../../utils";
import { Player } from "./Player";
import { TeamType } from "./Role";

export enum GameState {
    None = "None",
    Waiting = "Waiting",
    Day = "Day",
    Voting = "Voting",
    Approving = "Approving",
    Night = "Night",
    Result = "Result",
}

export class GameRoomState extends Schema {
    @type("string") roomName: string;
    @type("number") maxClients: number;
    @type("string") state: GameState;
    @type("string") masterId: string;
    @type({ map: Player }) players = new MapSchema<Player>();
    @type("number") round: number = 0;
    votes: string[] = [];

    isDuringGame() {
        return (
            this.state != GameState.Waiting && this.state != GameState.Result
        );
    }

    isTeamWinner(team: TeamType) {
        if (team == TeamType.Citizen) {
            for (const [id, player] of this.players) {
                if (!player.role) {
                    return false;
                }
                if (player.role.team == TeamType.Mafia && player.isAlive) {
                    return false;
                }
            }
            return true;
        } else if (team == TeamType.Mafia) {
            let mafiaTeamCount = 0;
            let citizenTeamCount = 0;
            for (const [id, player] of this.players) {
                if (!player.role) {
                    return false;
                }
                if (player.role.team == TeamType.Mafia && player.isAlive) {
                    mafiaTeamCount++;
                } else if (
                    player.role.team == TeamType.Citizen &&
                    player.isAlive
                ) {
                    citizenTeamCount++;
                }
            }
            return citizenTeamCount <= mafiaTeamCount;
        }
    }

    getWinningTeam(): TeamType | null {
        if (this.isTeamWinner(TeamType.Mafia)) {
            return TeamType.Mafia;
        }
        if (this.isTeamWinner(TeamType.Citizen)) {
            return TeamType.Citizen;
        }
        return null;
    }

    tryVote(target: string) {
        this.votes.push(target);
        return true;
    }

    calculateVotes() {
        const cnt = getElCount(this.votes);
        const values = Object.values(cnt).sort().reverse();
        if (values.length > 1 && values[0] == values[1]) {
            return false;
        }
        const key = Object.keys(cnt).find((key) => cnt[key] === values[0]);
        return [key, values[0]];
    }

    reset() {
        this.round = 0;
        this.players.forEach((player) => {
            player.role = undefined;
            player.isAlive = true;
        });
    }
}
