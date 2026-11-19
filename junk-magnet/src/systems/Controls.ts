/** Shared input state written by the HUD's pointer/touch handlers and read by the game. */
export const Controls = {
  touchX: 0,
  touchY: 0,
  touchActive: false,
  pulseQueued: false,
  /** Mouse aim in screen pixels (the game converts it to world space). */
  aimX: 0,
  aimY: 0,
  hasAim: false,
  /** Left mouse held: fireballs (and charging Meteor Drop). */
  fireHeld: false,
  /** Right-click / special button pressed. */
  specialQueued: false,
  /** True once the player has touched the screen: show the joystick and touch buttons. */
  isTouch: false,
  reset(): void {
    this.touchX = 0;
    this.touchY = 0;
    this.touchActive = false;
    this.pulseQueued = false;
    this.fireHeld = false;
    this.specialQueued = false;
  },
};
