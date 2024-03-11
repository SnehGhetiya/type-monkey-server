import type { Server, Socket } from "socket.io";
import { generateParagraph } from "../utils/generateParagraph";
import { rooms } from "../setupListeners";

enum GameStatus {
  NOT_STARTED = "not-started",
  IN_PROGRESS = "in-progress",
  FINISHED = "finished",
}

type Player = {
  id: string;
  score: number;
  name: string;
};

export class Game {
  gameStatus:
    | GameStatus.IN_PROGRESS
    | GameStatus.NOT_STARTED
    | GameStatus.FINISHED;
  gameId: string;
  players: Player[];
  io: Server;
  gameHost: string;
  paragraph: string;

  constructor(id: string, io: Server, host: string) {
    this.gameId = id;
    this.players = [];
    this.io = io;
    this.gameHost = host;
    this.gameStatus = GameStatus.NOT_STARTED;
    this.paragraph = "";
  }

  setupListeners(socket: Socket) {
    socket.on("start-game", async () => {
      if (this.gameStatus === GameStatus.IN_PROGRESS)
        return socket.emit("error", "The game has already started");

      if (this.gameHost !== socket.id)
        return socket.emit("error", "You are not the host of the game");

      for (const player of this.players) {
        player.score = 0;
      }

      this.io.to(this.gameId).emit("players", this.players);

      this.gameStatus = GameStatus.IN_PROGRESS;

      const paragraph = await generateParagraph();

      this.paragraph = paragraph;

      this.io.to(this.gameId).emit("game-started", paragraph);

      setTimeout(() => {
        this.gameStatus = GameStatus.FINISHED;
        this.io.to(this.gameId).emit("game-finished");
        this.io.to(this.gameId).emit("players", this.players);
      }, 60000);
    });

    socket.on("player-typed", (sentence: string) => {
      if (this.gameStatus !== GameStatus.IN_PROGRESS)
        return socket.emit("error", "The game has not started yet");

      const splittedParagraph = this.paragraph.split(" ");
      const splittedTyped = sentence.split(" ");

      let score = 0;

      for (let i = 0; i < splittedTyped.length; i++) {
        if (splittedTyped[i] === splittedParagraph[i]) {
          score++;
        } else {
          break;
        }
      }

      const player = this.players.find((player) => player.id === socket.id);

      if (player) {
        player.score = score;
      }

      this.io.to(this.gameId).emit("player-score", { id: socket.id, score });
    });

    socket.on("leave", () => {
      if (socket.id === this.gameHost) {
        this.players = this.players.filter((player) => player.id !== socket.id);
        if (this.players.length !== 0) {
          this.gameHost = this.players[0].id;
        } else {
          rooms.delete(this.gameId);
        }
      }

      socket.leave(this.gameId);
      this.players = this.players.filter((player) => player.id !== socket.id);
      this.io.to(this.gameId).emit("player-left", socket.id);
    });

    socket.on("disconnect", () => {
      if (socket.id === this.gameHost) {
        this.players = this.players.filter((player) => player.id !== socket.id);
        if (this.players.length !== 0) {
          this.gameHost = this.players[0].id;
        } else {
          rooms.delete(this.gameId);
        }
      }

      socket.leave(this.gameId);
      this.players = this.players.filter((player) => player.id !== socket.id);
      this.io.to(this.gameId).emit("player-left", socket.id);
    });
  }

  joinPlayer(id: string, name: string, socket: Socket) {
    if (this.gameStatus === GameStatus.IN_PROGRESS)
      return socket.emit("error", "You cannot join the already started game");

    this.players.push({ id, name, score: 0 });

    this.io.to(this.gameId).emit("player-joined", {
      id,
      name,
      score: 0,
    });

    socket.emit("players", this.players);
    socket.emit("new-host", this.gameHost);

    this.setupListeners(socket);
  }
}
