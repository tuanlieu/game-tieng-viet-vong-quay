import { Settings2, Volume2, VolumeX } from "lucide-react";
import { Button, Card } from "./UI";
import { SOUND_FILES, useAudio } from "../lib/audio";
import { useState } from "react";

const labels: Record<keyof typeof SOUND_FILES, string> = {
  questionStart: "Mở câu hỏi", countdown: "Đếm ngược", tenSeconds: "Còn 10 giây", correct: "Trả lời đúng", incorrect: "Trả lời sai", tileClick: "Bấm chọn chữ", submit: "Nộp đáp án", wheelSpin: "Vòng quay", waitingRoom: "Nhạc phòng chờ", wheelBackground: "Nhạc nền vòng quay",
};
export function AudioButton() {
  const audio = useAudio();
  const enabled = audio.prefs.enabled;
  return <button
    type="button"
    className={`audio-button${enabled ? "" : " is-muted"}`}
    aria-label={enabled ? "Tắt âm thanh" : "Bật âm thanh"}
    aria-pressed={enabled}
    title={enabled ? "Tắt âm thanh" : "Bật âm thanh"}
    onClick={() => {
      if (enabled) audio.update({ enabled: false });
      else void audio.activate();
    }}
  >{enabled ? <Volume2 size={19} /> : <VolumeX size={19} />}</button>;
}
export function AudioSettings() {
  const audio = useAudio();
  const [open, setOpen] = useState(false);
  return <>
    <Button kind="outline" onClick={() => { void audio.activate(); setOpen(true); }}><Settings2 size={16} /> Âm thanh</Button>
    {open && <Card className="audio-settings">
      <div className="page-title"><div><h2>Cài đặt âm thanh</h2><p>Thiết lập này chỉ áp dụng cho thiết bị hiện tại.</p></div><button aria-label="Đóng" onClick={() => setOpen(false)}>×</button></div>
      {!audio.prefs.enabled && <Button onClick={() => void audio.activate()}><Volume2 size={16} /> Bật âm thanh</Button>}
      <label>Âm lượng tổng <input aria-label="Âm lượng tổng" type="range" min="0" max="1" step="0.05" value={audio.prefs.master} onChange={(e) => audio.update({ master: Number(e.target.value) })} /></label>
      <label><input type="checkbox" checked={audio.prefs.music} onChange={(e) => audio.update({ music: e.target.checked })} /> Bật nhạc nền</label>
      <label><input type="checkbox" checked={audio.prefs.effects} onChange={(e) => audio.update({ effects: e.target.checked })} /> Bật hiệu ứng và lời nhắc</label>
      <label>Phát âm thanh trên <select value={audio.prefs.placement} onChange={(e) => audio.update({ placement: e.target.value as "all" | "presentation" })}><option value="all">Màn hình này</option><option value="presentation">Chỉ khi đang trình chiếu</option></select></label>
      <div className="sound-previews">{Object.entries(SOUND_FILES).map(([id]) => <Button key={id} kind="subtle" onClick={() => audio.play(id as keyof typeof SOUND_FILES)}>{labels[id as keyof typeof SOUND_FILES]}</Button>)}</div>
    </Card>}
  </>;
}
