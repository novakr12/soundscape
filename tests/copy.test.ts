import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { copyText } from "../lib/copy";

const savedDescriptors = new Map<string, PropertyDescriptor | undefined>();

function setGlobal(name: "window" | "navigator" | "document", value: unknown) {
  if (!savedDescriptors.has(name)) {
    savedDescriptors.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  }
  Object.defineProperty(globalThis, name, {
    value,
    configurable: true,
    writable: true,
  });
}

afterEach(() => {
  for (const [name, descriptor] of savedDescriptors) {
    if (descriptor) {
      Object.defineProperty(globalThis, name, descriptor);
    } else {
      Reflect.deleteProperty(globalThis, name);
    }
  }
  savedDescriptors.clear();
});

function fakeDocument(result: boolean, shouldThrow = false) {
  let appended = false;
  let removed = false;
  let focused = false;
  let selected = false;
  let selectionEnd = -1;
  let copiedCommand = "";

  const field = {
    value: "",
    style: {} as Record<string, string>,
    setAttribute() {},
    focus() {
      focused = true;
    },
    select() {
      selected = true;
    },
    setSelectionRange(_start: number, end: number) {
      selectionEnd = end;
    },
    remove() {
      removed = true;
    },
  };

  return {
    document: {
      createElement() {
        return field;
      },
      body: {
        appendChild() {
          appended = true;
        },
      },
      execCommand(command: string) {
        copiedCommand = command;
        if (shouldThrow) throw new Error("execCommand failed");
        return result;
      },
    },
    inspect() {
      return { appended, removed, focused, selected, selectionEnd, copiedCommand, value: field.value };
    },
  };
}

describe("copyText", () => {
  it("uses soundscapeDesktopCopy first when present", async () => {
    let copiedWithDesktop = "";
    let navigatorCalled = false;
    setGlobal("window", {
      soundscapeDesktopCopy(text: string) {
        copiedWithDesktop = text;
        return true;
      },
    });
    setGlobal("navigator", {
      clipboard: {
        async writeText() {
          navigatorCalled = true;
        },
      },
    });

    assert.equal(await copyText("tok-123"), true);
    assert.equal(copiedWithDesktop, "tok-123");
    assert.equal(navigatorCalled, false);
  });

  it("falls through to navigator.clipboard.writeText when desktop hook is absent or fails", async () => {
    let clipboardText = "";
    setGlobal("window", {
      soundscapeDesktopCopy() {
        return false;
      },
    });
    setGlobal("navigator", {
      clipboard: {
        async writeText(text: string) {
          clipboardText = text;
        },
      },
    });

    assert.equal(await copyText("https://example.com/invite"), true);
    assert.equal(clipboardText, "https://example.com/invite");
  });

  it("falls through to execCommand when clipboard.writeText rejects and cleans up textarea", async () => {
    const fake = fakeDocument(true);
    setGlobal("window", {
      soundscapeDesktopCopy() {
        throw new Error("bridge error");
      },
    });
    setGlobal("navigator", {
      clipboard: {
        async writeText() {
          throw new Error("not allowed");
        },
      },
    });
    setGlobal("document", fake.document);

    assert.equal(await copyText("fallback text"), true);
    const state = fake.inspect();
    assert.equal(state.value, "fallback text");
    assert.equal(state.appended, true);
    assert.equal(state.focused, true);
    assert.equal(state.selected, true);
    assert.equal(state.selectionEnd, "fallback text".length);
    assert.equal(state.copiedCommand, "copy");
    assert.equal(state.removed, true);
  });

  it("returns false when no copy mechanism succeeds", async () => {
    const fake = fakeDocument(false, true);
    setGlobal("window", {});
    setGlobal("navigator", {});
    setGlobal("document", fake.document);

    assert.equal(await copyText("nothing"), false);
    assert.equal(fake.inspect().removed, true);
  });
});
