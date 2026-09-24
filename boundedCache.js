export class BoundedLruMap extends Map {
  constructor(limit = 6) {
    super();
    this.limit = Math.max(1, Number(limit) || 6);
  }

  get(key) {
    if (!super.has(key)) return undefined;
    const value = super.get(key);
    super.delete(key);
    super.set(key, value);
    return value;
  }

  set(key, value) {
    if (super.has(key)) super.delete(key);
    super.set(key, value);
    while (this.size > this.limit) {
      const oldest = this.keys().next().value;
      super.delete(oldest);
    }
    return this;
  }
}
