import Phaser from "phaser";

type UiState =
  | { type: "PLAYING"; score: number; lives: number; mode: string; frightened: boolean }
  | { type: "PAUSED"; score: number; lives: number; mode: string; frightened: boolean }
  | { type: "LEVEL_COMPLETE"; score: number; lives: number; mode: string; frightened: boolean }
  | { type: "GAME_OVER"; score: number; lives: number; mode: string; frightened: boolean };

export class UIScene extends Phaser.Scene {
  private scoreText?: Phaser.GameObjects.Text;
  private livesText?: Phaser.GameObjects.Text;
  private modeText?: Phaser.GameObjects.Text;
  private overlay?: Phaser.GameObjects.Rectangle;
  private overlayText?: Phaser.GameObjects.Text;

  constructor() {
    super("UIScene");
  }

  create() {
    this.scoreText = this.add
      .text(8, 6, "Score: 0", { fontFamily: "monospace", fontSize: "12px", color: "#9aa0a6" })
      .setScrollFactor(0);

    this.livesText = this.add
      .text(this.scale.width - 8, 6, "Lives: 3", { fontFamily: "monospace", fontSize: "12px", color: "#9aa0a6" })
      .setOrigin(1, 0)
      .setScrollFactor(0);

    this.modeText = this.add
      .text(8, 22, "Ghosts: SCATTER", { fontFamily: "monospace", fontSize: "12px", color: "#9aa0a6" })
      .setScrollFactor(0);

    this.overlay = this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x000000, 0.6).setOrigin(0, 0);
    this.overlayText = this.add
      .text(this.scale.width / 2, this.scale.height / 2, "", {
        fontFamily: "monospace",
        fontSize: "28px",
        color: "#ffffff",
        align: "center"
      })
      .setOrigin(0.5, 0.5);

    this.setOverlay(null);

    const game = this.scene.get("GameScene");
    game.events.on("ui", this.onUiState, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      game.events.off("ui", this.onUiState, this);
    });
  }

  private onUiState(state: UiState) {
    this.scoreText?.setText(`Score: ${state.score}`);
    this.livesText?.setText(`Lives: ${state.lives}`);
    this.modeText?.setText(`Ghosts: ${state.mode}${state.frightened ? " (FRIGHT)" : ""}`);

    switch (state.type) {
      case "PLAYING":
        this.setOverlay(null);
        break;
      case "PAUSED":
        this.setOverlay("PAUSED\n(P/Esc to resume)");
        break;
      case "LEVEL_COMPLETE":
        this.setOverlay("LEVEL COMPLETE\n(Enter to restart)");
        break;
      case "GAME_OVER":
        this.setOverlay("GAME OVER\n(Enter to restart)");
        break;
    }
  }

  private setOverlay(text: string | null) {
    const visible = text !== null;
    if (this.overlay) this.overlay.setVisible(visible);
    if (this.overlayText) this.overlayText.setVisible(visible).setText(text ?? "");
  }
}

