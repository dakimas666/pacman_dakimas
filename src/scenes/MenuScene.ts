import Phaser from "phaser";

export class MenuScene extends Phaser.Scene {
  constructor() {
    super("MenuScene");
  }

  create() {
    const { width, height } = this.scale;

    this.add.rectangle(0, 0, width, height, 0x000000).setOrigin(0, 0);

    this.add
      .text(width / 2, height / 2 - 40, "PAC-MAN", {
        fontFamily: "monospace",
        fontSize: "48px",
        color: "#ffd800"
      })
      .setOrigin(0.5, 0.5);

    this.add
      .text(width / 2, height / 2 + 20, "Enter / Click to Start", {
        fontFamily: "monospace",
        fontSize: "16px",
        color: "#9aa0a6"
      })
      .setOrigin(0.5, 0.5);

    this.add
      .text(width / 2, height / 2 + 48, "Arrows: Move   P/Esc: Pause", {
        fontFamily: "monospace",
        fontSize: "14px",
        color: "#9aa0a6"
      })
      .setOrigin(0.5, 0.5);

    const start = () => {
      this.scene.start("GameScene");
      this.scene.launch("UIScene");
    };

    const enter = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
    if (enter) enter.once("down", start);
    this.input.once(Phaser.Input.Events.POINTER_DOWN, start);
  }
}

