/** Fixed-size object pool: everything is allocated up front, nothing in the game loop. */
export class Pool<T extends { active: boolean }> {
  readonly items: T[] = [];
  private free: T[] = [];

  constructor(size: number, factory: (index: number) => T) {
    for (let i = 0; i < size; i++) {
      const item = factory(i);
      item.active = false;
      this.items.push(item);
      this.free.push(item);
    }
  }

  obtain(): T | null {
    const item = this.free.pop();
    if (!item) return null;
    item.active = true;
    return item;
  }

  release(item: T): void {
    if (!item.active) return;
    item.active = false;
    this.free.push(item);
  }
}
