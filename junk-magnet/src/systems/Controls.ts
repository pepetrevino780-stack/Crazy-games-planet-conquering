/** Shared input state written by the HUD's touch controls and read by the game. */
export const Controls = {
  touchX: 0,
  touchY: 0,
  touchActive: false,
  pulseQueued: false,
  /** True once the player has touched the screen: show the joystick and Pulse button. */
  isTouch: false,
  reset(): void {
    this.touchX = 0;
    this.touchY = 0;
    this.touchActive = false;
    this.pulseQueued = false;
  },
};
