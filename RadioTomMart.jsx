import { useState, useRef, useEffect, useCallback } from "react";

/**
 * Radio TomMart — молдавское интернет-радио.
 * - Реальный стрим: список станций тянется из открытого каталога radio-browser.info
 *   (работает в браузере пользователя). Есть резервный список и поле для своей ссылки.
 * - Стиль: цвета флага Молдовы, народные орнаменты (алтицэ) и виноградные мотивы.
 *
 * Использование: <RadioTomMart />  — пропсов не требует.
 */

const PALETTE = {
  blue: "#1C4CA0",
  blueDark: "#123072",
  yellow: "#FFD200",
  red: "#CE1126",
  wine: "#5B0E2D",
  cream: "#FBF3E4",
  creamDark: "#F0E2C6",
  ink: "#2A160B",
};

// Зеркала открытого каталога радиостанций (CORS разрешён).
const API_SERVERS = [
  "https://de1.api.radio-browser.info",
  "https://nl1.api.radio-browser.info",
  "https://at1.api.radio-browser.info",
  "https://fi1.api.radio-browser.info",
];

// Резерв на случай, если каталог недоступен. Ссылку всегда можно заменить своей.
const FALLBACK_STATIONS = [
  { name: "Radio Moldova Actualități", url: "https://livestream.trm.md/radiomoldova", tags: "public, news", bitrate: 128, codec: "MP3" },
  { name: "Radio Noroc", url: "https://stream.radionoroc.md/noroc", tags: "folk, pop", bitrate: 128, codec: "MP3" },
];

export default function RadioTomMart() {
  const audioRef = useRef(null);
  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [index, setIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [volume, setVolume] = useState(0.85);
  const [muted, setMuted] = useState(false);
  const [playError, setPlayError] = useState("");
  const [customUrl, setCustomUrl] = useState("");

  const current = stations[index] || null;

  // --- Загрузка списка молдавских станций из открытого каталога --------------
  useEffect(() => {
    let cancelled = false;

    async function loadStations() {
      setLoading(true);
      for (const base of API_SERVERS) {
        try {
          const res = await fetch(
            `${base}/json/stations/bycountrycodeexact/MD?hidebroken=true&order=clickcount&reverse=true&limit=40`,
            { headers: { "User-Agent": "RadioTomMart/1.0" } }
          );
          if (!res.ok) continue;
          const data = await res.json();
          const seen = new Set();
          const cleaned = data
            .map((s) => ({
              name: (s.name || "").trim(),
              url: (s.url_resolved || s.url || "").trim(),
              tags: s.tags || "",
              bitrate: s.bitrate || 0,
              codec: s.codec || "",
              favicon: s.favicon || "",
            }))
            .filter((s) => s.name && /^https?:\/\//i.test(s.url))
            .filter((s) => {
              const key = s.name.toLowerCase();
              if (seen.has(key)) return false;
              seen.add(key);
              return true;
            });
          if (!cancelled && cleaned.length) {
            setStations(cleaned);
            setLoadError("");
            setLoading(false);
            return;
          }
        } catch (e) {
          // пробуем следующее зеркало
        }
      }
      if (!cancelled) {
        setStations(FALLBACK_STATIONS);
        setLoadError("Каталог недоступен — показан резервный список. Можно вставить свою ссылку ниже.");
        setLoading(false);
      }
    }

    loadStations();
    return () => {
      cancelled = true;
    };
  }, []);

  // --- Громкость -------------------------------------------------------------
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
      audioRef.current.muted = muted;
    }
  }, [volume, muted]);

  // --- Воспроизведение -------------------------------------------------------
  const playCurrent = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !current) return;
    setPlayError("");
    if (audio.src !== current.url) {
      audio.src = current.url;
    }
    setBuffering(true);
    const p = audio.play();
    if (p && p.catch) {
      p.catch(() => {
        setBuffering(false);
        setPlayError("Не удалось запустить поток. Попробуйте другую станцию или свою ссылку.");
      });
    }
  }, [current]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !current) return;
    if (isPlaying) {
      audio.pause();
    } else {
      playCurrent();
    }
  }, [isPlaying, current, playCurrent]);

  const selectStation = useCallback(
    (i) => {
      setIndex(i);
      const audio = audioRef.current;
      const st = stations[i];
      if (!audio || !st) return;
      setPlayError("");
      audio.src = st.url;
      setBuffering(true);
      const p = audio.play();
      if (p && p.catch) {
        p.catch(() => {
          setBuffering(false);
          setPlayError("Не удалось запустить поток. Попробуйте другую станцию.");
        });
      }
    },
    [stations]
  );

  const step = useCallback(
    (dir) => {
      if (!stations.length) return;
      const next = (index + dir + stations.length) % stations.length;
      selectStation(next);
    },
    [index, stations.length, selectStation]
  );

  const playCustom = useCallback(() => {
    const url = customUrl.trim();
    if (!/^https?:\/\//i.test(url)) {
      setPlayError("Вставьте корректную ссылку на поток (http(s)://…).");
      return;
    }
    const custom = { name: "Моя станция", url, tags: "custom", bitrate: 0, codec: "" };
    const next = [custom, ...stations.filter((s) => s.url !== url)];
    setStations(next);
    setIndex(0);
    const audio = audioRef.current;
    if (audio) {
      setPlayError("");
      audio.src = url;
      setBuffering(true);
      const p = audio.play();
      if (p && p.catch) p.catch(() => setPlayError("Поток не запустился. Проверьте ссылку (mp3/aac играют напрямую)."));
    }
  }, [customUrl, stations]);

  const bars = Array.from({ length: 11 });

  return (
    <div
      className="min-h-screen w-full flex items-center justify-center p-4"
      style={{
        background: `radial-gradient(1200px 600px at 20% -10%, ${PALETTE.blue}22, transparent 60%),
                     radial-gradient(1000px 700px at 100% 120%, ${PALETTE.wine}33, transparent 55%),
                     linear-gradient(160deg, ${PALETTE.cream}, ${PALETTE.creamDark})`,
        color: PALETTE.ink,
        fontFamily: "'Segoe UI', system-ui, sans-serif",
      }}
    >
      <StyleBlock />

      <div
        className="w-full max-w-md rounded-3xl overflow-hidden shadow-2xl"
        style={{
          background: `linear-gradient(180deg, #ffffff, ${PALETTE.cream})`,
          border: `1px solid ${PALETTE.creamDark}`,
          boxShadow: `0 30px 60px -20px ${PALETTE.wine}55`,
        }}
      >
        {/* Верхний орнамент */}
        <OrnamentBand />

        {/* Шапка с флагом и лого */}
        <div className="flex items-center gap-3 px-5 pt-4 pb-3">
          <FlagBadge />
          <div className="flex-1 leading-tight">
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-black tracking-tight" style={{ color: PALETTE.wine }}>
                Radio
              </span>
              <span className="text-2xl font-black tracking-tight" style={{ color: PALETTE.red }}>
                TomMart
              </span>
            </div>
            <div className="text-xs font-semibold" style={{ color: PALETTE.blue }}>
              muzică din inima Moldovei · музыка из сердца Молдовы
            </div>
          </div>
          <GrapeIcon />
        </div>

        {/* Дисплей «сейчас в эфире» */}
        <div className="px-5">
          <div
            className="rounded-2xl px-4 py-4 relative overflow-hidden"
            style={{
              background: `linear-gradient(135deg, ${PALETTE.blueDark}, ${PALETTE.blue})`,
              color: PALETTE.cream,
              boxShadow: `inset 0 0 0 2px ${PALETTE.yellow}55`,
            }}
          >
            <VineCorner />
            <div className="text-[10px] uppercase tracking-widest opacity-80 flex items-center gap-2">
              <span
                className="inline-block w-2 h-2 rounded-full"
                style={{
                  background: isPlaying ? "#48e08b" : PALETTE.yellow,
                  boxShadow: isPlaying ? "0 0 8px #48e08b" : "none",
                }}
              />
              {loading ? "Настройка волны…" : buffering ? "Буферизация…" : isPlaying ? "В эфире" : "Пауза"}
            </div>

            <div className="mt-1 text-lg font-bold truncate">
              {loading ? "…" : current ? current.name : "Нет станций"}
            </div>
            <div className="text-xs opacity-80 truncate min-h-4">
              {current ? formatMeta(current) : ""}
            </div>

            {/* Эквалайзер */}
            <div className="mt-3 flex items-end gap-1 h-12">
              {bars.map((_, i) => (
                <span
                  key={i}
                  className="flex-1 rounded-t"
                  style={{
                    height: "100%",
                    transformOrigin: "bottom",
                    background: `linear-gradient(${PALETTE.yellow}, ${PALETTE.red})`,
                    animation: "tm-eq 900ms ease-in-out infinite",
                    animationDelay: `${(i % 6) * 90}ms`,
                    animationDuration: `${700 + (i % 5) * 120}ms`,
                    animationPlayState: isPlaying && !buffering ? "running" : "paused",
                    opacity: isPlaying && !buffering ? 1 : 0.35,
                    transform: isPlaying && !buffering ? undefined : "scaleY(0.2)",
                  }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Управление */}
        <div className="px-5 pt-4 pb-2 flex items-center justify-center gap-5">
          <RoundBtn label="Предыдущая" onClick={() => step(-1)} size={46}>
            <PrevIcon />
          </RoundBtn>

          <button
            onClick={togglePlay}
            aria-label={isPlaying ? "Пауза" : "Играть"}
            className="flex items-center justify-center rounded-full active:scale-95 transition-transform"
            style={{
              width: 72,
              height: 72,
              background: `linear-gradient(145deg, ${PALETTE.red}, ${PALETTE.wine})`,
              color: PALETTE.cream,
              boxShadow: `0 10px 24px -6px ${PALETTE.red}aa, inset 0 0 0 3px ${PALETTE.yellow}`,
            }}
          >
            {buffering ? <Spinner /> : isPlaying ? <PauseIcon /> : <PlayIcon />}
          </button>

          <RoundBtn label="Следующая" onClick={() => step(1)} size={46}>
            <NextIcon />
          </RoundBtn>
        </div>

        {/* Громкость */}
        <div className="px-6 pb-3 flex items-center gap-3">
          <button
            onClick={() => setMuted((m) => !m)}
            aria-label="Звук"
            className="shrink-0"
            style={{ color: PALETTE.wine }}
          >
            {muted || volume === 0 ? <MuteIcon /> : <VolumeIcon />}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={muted ? 0 : volume}
            onChange={(e) => {
              setMuted(false);
              setVolume(parseFloat(e.target.value));
            }}
            className="w-full cursor-pointer"
            style={{ accentColor: PALETTE.red }}
            aria-label="Громкость"
          />
          <span className="text-xs font-semibold w-9 text-right" style={{ color: PALETTE.blue }}>
            {Math.round((muted ? 0 : volume) * 100)}
          </span>
        </div>

        {playError && (
          <div className="mx-5 mb-2 text-xs rounded-lg px-3 py-2" style={{ background: `${PALETTE.red}18`, color: PALETTE.wine }}>
            {playError}
          </div>
        )}
        {loadError && (
          <div className="mx-5 mb-2 text-xs rounded-lg px-3 py-2" style={{ background: `${PALETTE.yellow}30`, color: PALETTE.ink }}>
            {loadError}
          </div>
        )}

        {/* Список станций */}
        <div className="px-5 pb-1">
          <div className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: PALETTE.wine }}>
            Станции
          </div>
          <div
            className="rounded-xl overflow-y-auto"
            style={{ maxHeight: 176, background: "#fff", border: `1px solid ${PALETTE.creamDark}` }}
          >
            {loading && <div className="px-3 py-4 text-sm opacity-60">Загружаем волны Молдовы…</div>}
            {!loading &&
              stations.map((s, i) => {
                const active = i === index;
                return (
                  <button
                    key={s.url + i}
                    onClick={() => selectStation(i)}
                    className="w-full text-left px-3 py-2 flex items-center gap-3 transition-colors"
                    style={{
                      background: active ? `${PALETTE.blue}14` : "transparent",
                      borderLeft: `4px solid ${active ? PALETTE.red : "transparent"}`,
                    }}
                  >
                    <span
                      className="flex items-center justify-center rounded-full shrink-0 text-[11px] font-black"
                      style={{
                        width: 26,
                        height: 26,
                        background: active ? PALETTE.red : PALETTE.creamDark,
                        color: active ? PALETTE.cream : PALETTE.wine,
                      }}
                    >
                      {i + 1}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-semibold truncate" style={{ color: PALETTE.ink }}>
                        {s.name}
                      </span>
                      <span className="block text-[11px] truncate opacity-60">{formatMeta(s)}</span>
                    </span>
                    {active && isPlaying && <MiniEq />}
                  </button>
                );
              })}
          </div>
        </div>

        {/* Своя ссылка на поток */}
        <div className="px-5 pt-3 pb-1 flex gap-2">
          <input
            value={customUrl}
            onChange={(e) => setCustomUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && playCustom()}
            placeholder="https://… своя ссылка на поток (mp3/aac)"
            className="flex-1 rounded-lg px-3 py-2 text-sm outline-none"
            style={{ border: `1px solid ${PALETTE.creamDark}`, background: "#fff", color: PALETTE.ink }}
          />
          <button
            onClick={playCustom}
            className="rounded-lg px-4 text-sm font-bold active:scale-95 transition-transform"
            style={{ background: PALETTE.blue, color: PALETTE.cream }}
          >
            Играть
          </button>
        </div>

        {/* Нижний орнамент + подпись */}
        <div className="pt-3">
          <OrnamentBand flip />
        </div>
        <div className="text-center text-[10px] py-2 opacity-60" style={{ color: PALETTE.wine }}>
          Radio TomMart · данные о станциях: radio-browser.info
        </div>
      </div>

      {/* Аудио-элемент */}
      <audio
        ref={audioRef}
        onPlaying={() => {
          setIsPlaying(true);
          setBuffering(false);
        }}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onWaiting={() => setBuffering(true)}
        onStalled={() => setBuffering(true)}
        onError={() => {
          setBuffering(false);
          setIsPlaying(false);
          if (current) setPlayError("Поток недоступен. Попробуйте другую станцию.");
        }}
        preload="none"
      />
    </div>
  );
}

/* ---------------------------------------------------------------- helpers -- */

function formatMeta(s) {
  const parts = [];
  if (s.tags) parts.push(s.tags.split(",").slice(0, 2).join(", "));
  if (s.codec) parts.push(s.codec);
  if (s.bitrate) parts.push(`${s.bitrate} kbps`);
  return parts.filter(Boolean).join(" · ");
}

/* ------------------------------------------------------------- components -- */

function StyleBlock() {
  return (
    <style>{`
      @keyframes tm-eq { 0% { transform: scaleY(0.25);} 50% { transform: scaleY(1);} 100% { transform: scaleY(0.4);} }
      @keyframes tm-spin { to { transform: rotate(360deg);} }
      @keyframes tm-mini { 0%,100%{ transform: scaleY(0.4);} 50%{ transform: scaleY(1);} }
    `}</style>
  );
}

function OrnamentBand({ flip }) {
  // Народный мотив «ромб с крючками» (алтицэ), повторяется по ширине.
  return (
    <div style={{ transform: flip ? "scaleY(-1)" : "none", lineHeight: 0 }}>
      <svg viewBox="0 0 240 26" preserveAspectRatio="none" width="100%" height="26" role="presentation">
        <defs>
          <pattern id="tm-orn" width="24" height="26" patternUnits="userSpaceOnUse">
            <rect width="24" height="26" fill={PALETTE.wine} />
            {/* красный ромб */}
            <polygon points="12,3 22,13 12,23 2,13" fill={PALETTE.red} />
            {/* жёлтый внутренний ромб */}
            <polygon points="12,7 18,13 12,19 6,13" fill={PALETTE.yellow} />
            {/* синяя точка в центре */}
            <circle cx="12" cy="13" r="2.1" fill={PALETTE.blue} />
            {/* крючки по краям */}
            <rect x="0" y="11" width="3" height="4" fill={PALETTE.yellow} />
            <rect x="21" y="11" width="3" height="4" fill={PALETTE.yellow} />
          </pattern>
        </defs>
        <rect width="240" height="26" fill="url(#tm-orn)" />
      </svg>
    </div>
  );
}

function FlagBadge() {
  return (
    <div
      className="rounded-xl overflow-hidden shrink-0 flex"
      style={{ width: 44, height: 44, boxShadow: `0 4px 10px -3px ${PALETTE.wine}66` }}
      aria-hidden
    >
      <div style={{ flex: 1, background: PALETTE.blue }} />
      <div style={{ flex: 1, background: PALETTE.yellow, position: "relative" }}>
        {/* маленький «щит» намёком на герб */}
        <svg viewBox="0 0 24 24" width="100%" height="100%">
          <path d="M12 3 L20 6 V13 C20 18 12 22 12 22 C12 22 4 18 4 13 V6 Z" fill={PALETTE.red} opacity="0.9" />
          <circle cx="12" cy="11" r="3" fill={PALETTE.yellow} />
        </svg>
      </div>
      <div style={{ flex: 1, background: PALETTE.red }} />
    </div>
  );
}

function GrapeIcon() {
  const g = PALETTE.wine;
  return (
    <svg width="34" height="40" viewBox="0 0 34 40" aria-hidden className="shrink-0">
      {/* лист */}
      <path d="M17 3 C22 1 28 4 27 9 C31 8 33 12 29 14 C24 12 20 10 17 8 Z" fill="#3f7d3a" />
      <path d="M17 3 L17 9" stroke="#2f5f2c" strokeWidth="1" />
      {/* гроздь */}
      {[
        [17, 12],
        [12, 16],
        [22, 16],
        [17, 18],
        [8, 21],
        [26, 21],
        [13, 23],
        [21, 23],
        [17, 26],
        [11, 29],
        [23, 29],
        [17, 32],
        [17, 37],
      ].map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r="3.6" fill={g} stroke={PALETTE.red} strokeWidth="0.6" />
      ))}
    </svg>
  );
}

function VineCorner() {
  return (
    <svg
      width="90"
      height="90"
      viewBox="0 0 90 90"
      style={{ position: "absolute", right: -8, top: -8, opacity: 0.18 }}
      aria-hidden
    >
      <path d="M85 5 C60 10 55 35 70 55 C55 45 40 55 45 75" fill="none" stroke={PALETTE.yellow} strokeWidth="2.5" />
      {[
        [70, 20],
        [78, 30],
        [63, 30],
        [72, 42],
      ].map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r="4" fill={PALETTE.yellow} />
      ))}
    </svg>
  );
}

function RoundBtn({ children, onClick, label, size = 46 }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="flex items-center justify-center rounded-full active:scale-95 transition-transform"
      style={{
        width: size,
        height: size,
        background: "#fff",
        color: PALETTE.wine,
        border: `2px solid ${PALETTE.creamDark}`,
        boxShadow: `0 6px 14px -6px ${PALETTE.wine}55`,
      }}
    >
      {children}
    </button>
  );
}

function MiniEq() {
  return (
    <span className="flex items-end gap-0.5 h-4 shrink-0" aria-hidden>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-0.5 rounded-t"
          style={{
            height: "100%",
            transformOrigin: "bottom",
            background: PALETTE.red,
            animation: `tm-mini ${600 + i * 120}ms ease-in-out infinite`,
          }}
        />
      ))}
    </span>
  );
}

/* ----------------------------------------------------------------- icons -- */

function PlayIcon() {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}
function PauseIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
      <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
    </svg>
  );
}
function PrevIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
      <path d="M7 6h2v12H7zM20 6v12l-9-6z" />
    </svg>
  );
}
function NextIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
      <path d="M15 6h2v12h-2zM4 6l9 6-9 6z" />
    </svg>
  );
}
function VolumeIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
      <path d="M4 9v6h4l5 5V4L8 9H4zm12.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4z" />
    </svg>
  );
}
function MuteIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
      <path d="M4 9v6h4l5 5V4L8 9H4zm15 3 2.3-2.3-1.4-1.4L17.6 10l-2.3-2.3-1.4 1.4L16.2 11.4l-2.3 2.3 1.4 1.4L17.6 12.8l2.3 2.3 1.4-1.4z" />
    </svg>
  );
}
function Spinner() {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" style={{ animation: "tm-spin 900ms linear infinite" }}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
