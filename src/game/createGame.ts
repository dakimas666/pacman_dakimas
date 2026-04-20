import Phaser from "phaser";
import { GameScene } from "../scenes/GameScene";

export function createGame(): Phaser.Game {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: "app",
    backgroundColor: "#000000",
    pixelArt: true,
    roundPixels: true,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: 448,
      height: 496
    },
    scene: [GameScene]
  });

  // Canvas fokussierbar machen, damit Cursor-Keys zuverlässig ankommen
  // (und nicht vom Browser fürs Scrollen abgefangen werden).
  game.events.once(Phaser.Core.Events.READY, () => {
    const canvas = game.canvas;
    if (!canvas) return;
    canvas.setAttribute("tabindex", "0");
    canvas.style.outline = "none";
    canvas.focus();

    canvas.addEventListener("pointerdown", () => canvas.focus());
  });

  // Phaser FIT skaliert automatisch; das Resize-Event sorgt dafür,
  // dass die Canvas-Größe auch in sehr kleinen Viewports aktualisiert wird.
  const onResize = () => game.scale.refresh();
  window.addEventListener("resize", onResize);

  game.events.once(Phaser.Core.Events.DESTROY, () => {
    window.removeEventListener("resize", onResize);
  });

  return game;
}

