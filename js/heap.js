// heap.js — 배열로 만든 최소 힙(우선순위 큐).
// 부모는 항상 자식보다 우선순위 값이 작다. i번 칸의 부모는 (i-1)/2, 자식은 2i+1, 2i+2번 칸이다.
// push와 pop은 트리 높이만큼만 움직이므로 O(log n)이다.

export class MinHeap {
  constructor() {
    this.items = [];
  }

  get size() {
    return this.items.length;
  }

  push(value, priority) {
    this.items.push({ value, priority });
    this.siftUp(this.items.length - 1);
  }

  // 우선순위 값이 가장 작은 항목을 꺼낸다. 비어 있으면 null.
  pop() {
    if (this.items.length === 0) return null;
    const top = this.items[0];
    const last = this.items.pop();
    if (this.items.length > 0) {
      this.items[0] = last;
      this.siftDown(0);
    }
    return top;
  }

  // 새 항목을 부모보다 작은 동안 위로 올린다.
  siftUp(index) {
    let child = index;
    while (child > 0) {
      const parent = Math.floor((child - 1) / 2);
      if (this.items[parent].priority <= this.items[child].priority) break;
      this.swap(parent, child);
      child = parent;
    }
  }

  // 맨 위로 옮긴 항목을 더 작은 자식과 바꾸며 아래로 내린다.
  siftDown(index) {
    let parent = index;
    while (true) {
      const left = 2 * parent + 1;
      const right = 2 * parent + 2;
      let smallest = parent;
      if (left < this.size && this.items[left].priority < this.items[smallest].priority) smallest = left;
      if (right < this.size && this.items[right].priority < this.items[smallest].priority) smallest = right;
      if (smallest === parent) break;
      this.swap(parent, smallest);
      parent = smallest;
    }
  }

  swap(a, b) {
    [this.items[a], this.items[b]] = [this.items[b], this.items[a]];
  }
}
