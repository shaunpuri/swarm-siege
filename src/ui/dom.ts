// Tiny DOM helpers with runtime type guards instead of casts.

export function byId<T extends HTMLElement>(id: string, ctor: { new (): T; prototype: T }): T {
  const el = document.getElementById(id);
  if (!(el instanceof ctor)) throw new Error(`#${id} missing or wrong element type`);
  return el;
}

export function h(tag: string, className = "", text = ""): HTMLElement {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text) el.textContent = text;
  return el;
}

export function button(className: string, html: string, onClick: () => void): HTMLButtonElement {
  const el = document.createElement("button");
  el.className = className;
  el.innerHTML = html;
  el.addEventListener("click", (ev) => {
    ev.stopPropagation();
    onClick();
  });
  return el;
}

export function setText(el: HTMLElement, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}

export function show(el: HTMLElement, visible: boolean): void {
  el.classList.toggle("hidden", !visible);
}
