import { Room, Client, Delayed } from "colyseus";
import { IncomingMessage } from "http";
import { shuffle } from "../utils";
import { GameRoomState, GameState } from "./schema/GameRoomState";
import { Player } from "./schema/Player";
import { getRole, Role, RoleType, TeamType } from "./schema/Role";

interface CreateGameRoomOption {
    roomName: string;
    maxClients: number;
}

interface IBroadcastOptions {
    except?: Client;
    afterNextPatch?: boolean;
}

interface ISendOptions {
    afterNextPatch?: boolean;
}

export class GameRoom extends Room<GameRoomState> {
    timer: number;
    delayedInterval?: Delayed;
    defaultRoomNames = [
        "웰컴 투 마피아저디!",
        "우준님님 한 판 해요",
        "즐거운 마피아저디",
    ];

    onCreate(options: CreateGameRoomOption): void | Promise<any> {
        this.clock.start();
        //TODO options 값 체크는 나중에 알아서 잘 만드셈
        if (options.roomName == "$random") {
            options.roomName = this.getRandomRoomName();
        }
        this.maxClients = options.maxClients;
        this.setMetadata({
            roomName: options.roomName,
        });
        this.setState(
            new GameRoomState().assign({
                roomName: options.roomName,
                maxClients: options.maxClients,
            })
        );
        this.setGameState(GameState.Waiting);
        this.onMessage("game.chat", (client: Client, message: any) => {
            this.broadcast("game.chat", message, { except: client });
        });
        this.onMessage("game.start.request", (client: Client, message: any) => {
            if (this.state.players.size < 5) {
                client.send("game.start.response", { status: -1 });
                this.sendSystemChat(client, "최소 플레이 인원 수는 5명입니다.");
                // return;
            }
            this.lock();
            this.setGameState(GameState.Night);
            this.broadcastSystemChat("게임이 시작되었습니다!");
            this.broadcastSystemChat("자신의 직업을 확인해주세요!");
            this.allocateRoles();
        });
        this.onMessage(
            "game.timerTicket.use.request",
            (client: Client, message: any) => {
                const { ticketType } = message;
                if (this.state.state != GameState.Day) {
                    return;
                }
                const player = this.state.players.get(client.id);
                if (player.hasTimerTicket) {
                    player.hasTimerTicket = false;
                    if (ticketType == "increase") {
                        this.timer += 15;
                        this.broadcastSystemChat(
                            `${player.name}님이 시간을 연장하였습니다.`
                        );
                    } else if (ticketType == "decrease") {
                        this.timer -= 15;
                        this.broadcastSystemChat(
                            `${player.name}님이 시간을 단축하였습니다.`
                        );
                    }
                }
            }
        );
        this.onMessage("game.vote.request", (client: Client, message: any) => {
            const { target } = message;
            if (this.state.state != GameState.Voting) {
                return;
            }
            const player = this.state.players.get(client.id);
            if (player.hasVoteTicket) {
                player.hasVoteTicket = false;
                this.state.tryVote(target);
                this.sendSystemChat(client, `${target}님을 투표하셨습니다.`);
            } else {
                this.sendSystemChat(client, "이미 투표권을 사용하셨습니다.");
            }
        });
        this.onMessage(
            "game.approval.request",
            (client: Client, message: any) => {}
        );
        this.onMessage(
            "game.skill.use.request",
            (client: Client, message: any) => {}
        );
    }

    onAuth(client: Client, options: any, request?: IncomingMessage) {
        return true;
    }

    onJoin(client: Client, options?: any, auth?: any): void | Promise<any> {
        if (this.state.players.size == 0) {
            this.state.masterId = client.id;
        }
        this.state.players.set(
            client.id,
            new Player().assign({ id: client.id, name: client.id })
        );
        this.broadcastSystemChat(
            `${this.state.players.get(client.id).name}님이 입장하셨습니다.`
        );
    }

    onLeave(client: Client, consented?: boolean): void | Promise<any> {
        this.broadcastSystemChat(
            `${this.state.players.get(client.id).name}님이 퇴장하셨습니다.`
        );
        this.state.players.delete(client.id);
        if (this.state.masterId == client.id) {
            const [newMasterId] = this.state.players.keys();
            this.state.masterId = newMasterId;
            this.broadcastSystemChat(
                `${
                    this.state.players.get(newMasterId).name
                }님이 방장이 되셨습니다.`
            );
        }
    }

    setGameState(newState: GameState) {
        const previousState = this.state.state;
        this.state.state = newState;
        if (this.state.isDuringGame() && this.state.getWinningTeam()) {
            this.setGameState(GameState.Result);
            return;
        }
        if (newState == GameState.Waiting) {
            this.state.reset();
        } else if (newState == GameState.Night) {
            this.broadcastSystemChat(
                `${this.state.round}번째 밤이 되었습니다.`
            );
            this.startTimer(25, () => {
                this.setGameState(GameState.Day);
            });
        } else if (newState == GameState.Day) {
            this.state.round++;
            this.state.players.forEach((player) => {
                player.hasTimerTicket = true;
                player.hasVoteTicket = true;
            });
            this.broadcastSystemChat(
                `${this.state.round}번째 낮이 되었습니다.`
            );
            this.startTimer(15 * this.state.players.size, () => {
                this.setGameState(GameState.Voting);
            });
        } else if (newState == GameState.Voting) {
            this.broadcastSystemChat("투표 시간입니다.");
            this.startTimer(25, () => {
                const result = this.state.calculateVotes();
                if (!result) {
                    this.broadcastSystemChat(
                        "득표수가 동일하여 투표가 무효가 되었습니다."
                    );
                    this.setGameState(GameState.Night);
                    return;
                }
                this.setGameState(GameState.Approving);
            });
        } else if (newState == GameState.Approving) {
            this.broadcastSystemChat("찬/반 시간입니다.");
            this.startTimer(10, () => {
                this.setGameState(GameState.Night);
            });
        } else if (newState == GameState.Result) {
            this.broadcastSystemChat(
                `${this.state.getWinningTeam()} 팀의 승리!`
            );
            this.startTimer(5, () => {
                this.unlock();
                this.setGameState(GameState.Waiting);
            });
        }
    }

    startTimer(timer: number, onTimerFinished?: () => void) {
        this.timer = timer;
        this.broadcastSyncTimer();
        if (this.delayedInterval) {
            this.delayedInterval.clear();
            this.delayedInterval = undefined;
        }
        this.delayedInterval = this.clock.setInterval(() => {
            this.timer -= 1;
            this.broadcastSyncTimer();
            if (this.timer <= 0) {
                this.delayedInterval.clear();
                this.delayedInterval = undefined;
                if (onTimerFinished) {
                    onTimerFinished();
                }
            }
        }, 1000);
    }

    onDispose(): void | Promise<any> {
        console.log("room", this.roomId, "disposing...");
    }

    getRandomRoomName() {
        return this.defaultRoomNames[
            Math.floor(Math.random() * this.defaultRoomNames.length)
        ];
    }

    broadcastChat(message: any, options?: IBroadcastOptions) {
        this.broadcast("game.chat", message, options);
    }

    broadcastSystemChat(content: string, options?: IBroadcastOptions) {
        this.broadcastChat(
            { content: content, clientId: null, name: "[System]" },
            options
        );
    }

    sendChat(client: Client, message: any, options?: ISendOptions) {
        client.send("game.chat", message, options);
    }

    sendSystemChat(client: Client, content: string, options?: ISendOptions) {
        this.sendChat(
            client,
            { content: content, clientId: null, name: "[System]" },
            options
        );
    }

    broadcastSyncTimer(options?: IBroadcastOptions) {
        this.broadcast(
            "game.sync.timer",
            { timer: this.timer, serverTime: Date.now() },
            options
        );
    }

    sendRoleAllocateEvent(client: Client, options?: ISendOptions) {
        const role = this.state.players.get(client.id).role;
        if (!role) {
            client.leave();
            return;
        }
        this.sendSystemChat(client, `당신의 직업은 ${role.name}입니다!`);
        this.sendSystemChat(client, `${role.name}: ${role.description}`);
        client.send("game.event.roleAllocate", { role: role }, options);
    }

    allocateRoles() {
        const roles: RoleType[] = [];
        const playersCount = this.state.players.size;
        let i = 0;
        for (i = 0; i < Math.floor(playersCount / 4); i++) {
            roles.push(RoleType.Mafia);
        }
        if (playersCount >= 8) {
            //
        }
        const cnt = playersCount - roles.length;
        for (i = 0; i < cnt; i++) {
            roles.push(RoleType.Citizen);
        }
        shuffle(roles);
        i = 0;
        this.state.players.forEach((player) => {
            player.role = getRole(roles[i]);
            i++;
        });
        this.clients.forEach((client) => {
            this.sendRoleAllocateEvent(client);
        });
    }
}
