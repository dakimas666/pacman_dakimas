import Phaser from "phaser";

export class HelloScene extends Phaser.Scene {
  private fpsText?: Phaser.GameObjects.Text;
  private infoText?: Phaser.GameObjects.Text;

  constructor() {
    super("HelloScene");
  }

  create() {
    const { width, height } = this.scale;

    this.add.rectangle(0, 0, width, height, 0x000000).setOrigin(0, 0);

    this.infoText = this.add
      .text(width / 2, height / 2 - 12, "Pac-Man — M0", {
        fontFamily: "monospace",
        fontSize: "20px",
        color: "#ffd800"
      })
      .setOrigin(0.5, 0.5);

    this.fpsText = this.add
      .text(width / 2, height / 2 + 18, "FPS: …", {
        fontFamily: "monospace",
        fontSize: "14px",
        color: "#9aa0a6"
      })
      .setOrigin(0.5, 0.5);

    this.scale.on(Phaser.Scale.Events.RESIZE, this.onResize, this);
  }

  update() {
    if (!this.fpsText) return;
    this.fpsText.setText(`FPS: ${Math.round(this.game.loop.actualFps)}`);
  }

  private onResize(gameSize: Phaser.Structs.Size) {
    const { width, height } = gameSize;

    this.cameras.main.setSize(width, height);

    if (this.infoText) this.infoText.setPosition(width / 2, height / 2 - 12);
    if (this.fpsText) this.fpsText.setPosition(width / 2, height / 2 + 18);
  }
}

