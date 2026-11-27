// The chat panel: ask where something is in the code and jump to the answer in the city.
"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { MAX_QUESTION_LENGTH, useChatStore } from "../../src/chat/chatStore";
import { openReference } from "../../src/chat/references";
import { useCityStore } from "../../src/city/store";

const BUSY_TEXT = { indexing: "Reading the code (first time only)…", asking: "Thinking…" } as const;

export function ChatPanel() {
  const city = useCityStore((state) => state.city);
  const messages = useChatStore((state) => state.messages);
  const busy = useChatStore((state) => state.busy);
  const status = useChatStore((state) => state.status);
  const ask = useChatStore((state) => state.ask);
  const [question, setQuestion] = useState("");
  const listEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void useChatStore.getState().loadStatus();
  }, [city]);

  useEffect(() => {
    listEnd.current?.scrollIntoView?.({ block: "nearest" });
  }, [messages, busy]);

  function submit(event: FormEvent) {
    event.preventDefault();
    const text = question.trim();
    if (!text || busy !== "idle") return;
    setQuestion("");
    void ask(text);
  }

  return (
    <div className="chat" data-testid="chat">
      {status && !status.ai && (
        <p className="note">No AI model is set up on the server. You get a plain search with the best places.</p>
      )}
      <div className="chat-messages" aria-live="polite">
        {messages.length === 0 && <p className="note">Ask for example: “Where is the email validated?”</p>}
        {messages.map((message) => (
          <div key={message.id} className={`chat-message ${message.role}${message.error ? " error" : ""}`}>
            <p>{message.text}</p>
            {message.references.length > 0 && (
              <ul className="chat-refs">
                {message.references.map((reference) => (
                  <li key={`${reference.file}:${reference.startLine}:${reference.endLine}`}>
                    <button type="button" onClick={() => openReference(reference)}>
                      {reference.file}:{reference.startLine}–{reference.endLine}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
        {busy !== "idle" && <p className="note">{BUSY_TEXT[busy]}</p>}
        <div ref={listEnd} />
      </div>
      <form onSubmit={submit} className="chat-form">
        <input
          value={question}
          maxLength={MAX_QUESTION_LENGTH}
          placeholder="Where is the logic for…?"
          aria-label="Question"
          onChange={(event) => setQuestion(event.target.value)}
        />
        <button type="submit" disabled={busy !== "idle" || question.trim() === ""}>
          Ask
        </button>
      </form>
    </div>
  );
}
