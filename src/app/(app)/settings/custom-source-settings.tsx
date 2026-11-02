"use client";

import { useState } from "react";
import { useTrackSave } from "@/components/save-tracker";
import { toastResult } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { JobSearchSettingsView } from "@/lib/job-search/sources";
import { saveCustomJobSource } from "./actions";

export function CustomSourceSettings({ initial, onSaved }: {
  initial: JobSearchSettingsView["custom"];
  onSaved: (result: Awaited<ReturnType<typeof saveCustomJobSource>>) => boolean;
}) {
  const track = useTrackSave();
  const [url, setUrl] = useState(initial.url);
  const [username, setUsername] = useState(initial.username);
  const [password, setPassword] = useState("");
  const [clear, setClear] = useState(false);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      const result = toastResult(await track(saveCustomJobSource({ url, username, password: password ? { action: "set", value: password } : { action: clear ? "clear" : "keep" } })));
      if (onSaved(result)) { setPassword(""); setClear(false); }
    } finally { setSaving(false); }
  };
  return <div className="flex flex-col gap-4">
    <Input label="Service URL" value={url} placeholder="http://jobfeed:8000" autoComplete="off" spellCheck={false} onChange={(event) => setUrl(event.target.value)} />
    <Input label="Username (optional)" value={username} autoComplete="off" spellCheck={false} onChange={(event) => setUsername(event.target.value)} />
    <Input label="Password (optional)" type="password" value={password} autoComplete="new-password"
      placeholder={!clear && initial.passwordState === "set" ? "Saved · leave empty to keep it" : "No password saved"}
      error={initial.passwordState === "unreadable" ? "Your saved password cannot be read. Enter it again or remove authentication." : undefined}
      onChange={(event) => setPassword(event.target.value)} />
    {initial.passwordState !== "none" && !clear && <Button variant="text" size="sm" className="self-start" onClick={() => { setUsername(""); setPassword(""); setClear(true); }}>Remove authentication</Button>}
    <p className="text-sm text-muted">Searches use your catalogue. A new search may need time to collect results. Run the search again later to see them.</p>
    <Button variant="secondary" className="self-start" disabled={saving} onClick={() => void save()}>{saving ? "Saving…" : "Save custom source"}</Button>
  </div>;
}
