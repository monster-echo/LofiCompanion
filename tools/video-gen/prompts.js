// MiniMax H3 提示词体系 —— LofiCompanion 皮肤海报 → 可循环氛围视频。
//
// 设计依据 MiniMax 官方《H3 Video Prompt Writing Guide》：
//   1. 首行对齐指令（I2VA / FL2VA 固定句式）+ 空行；
//   2. integrated_multimodal_description：[Shot 1] 风格与构图锚 + 运动时间线；
//   3. overall_soundscape：环境声（驱动微运动的物理一致性，成片后去除音轨）；
//   4. non_diegetic_music：恒为 N/A —— 应用自带 Lofi 音乐系统，绝不内嵌音乐。
//
// 防抽卡三原则：
//   · 图生视频：海报即首帧，构图/角色/风格 100% 锁定，不做文生视频；
//   · 循环状态首尾帧同图（FL2VA）：所有运动被迫回到起点，天然无缝循环；
//   · 显式负面清单 + 逐项点名保留细节（H3 对具体负面指令响应最好）。

// 每状态默认时长（秒，H3 允许 4–15）与是否循环。
// 循环态：ready/focusing/paused/resting —— 应用内长时间驻留，必须无缝循环；
// 动作态：drinking/completed —— 单次播放后回归前序状态，首帧出发即可。
export const STATE_SPECS = {
  // ready/resting 在 app 内可能长时间驻留（待机/休息倒计时），循环加长减少重复感
  ready: { loop: true, duration: 8 },
  // focusing 是主循环：叙事循环（写满→翻页→再写满），接缝被读作"翻页"
  focusing: { loop: true, duration: 15 },
  paused: { loop: true, duration: 6 },
  drinking: { loop: false, duration: 5 },
  resting: { loop: true, duration: 10 },
  completed: { loop: false, duration: 6 },
};

// ── 皮肤风格锁 ─────────────────────────────────────────────────────────────
// anchor：[Shot 1] 开场的风格/构图锚（含"逐项点名保留细节"）；
// ambientLoop：环境微运动（循环感来源，随场景物理走）；
// soundscape：overall_soundscape 字段（去音轨前也保持画面-声音物理一致）。
export const SKINS = {
  'rainy-study-room': {
    name: '雨夜书房',
    anchor:
      '2D-animated lofi illustration, soft cel shading, muted indigo-blue night palette with one warm amber light source. ' +
      'A static vertical medium shot of the exact scene in the reference image. Preserve exactly: ' +
      'the young woman with black hair in a messy bun with loose strands, navy blue knit sweater, thin gold pendant necklace; ' +
      'the wooden desk with a stack of dark hardcover books on the left, an open notebook in the center, ' +
      'a clear glass of water on the right, and a black dome desk lamp glowing warm amber at the right edge; ' +
      'the tall bookshelf standing in shadow on the far left; ' +
      'the large window behind her with heavy rain and blurred blue city lights outside.',
    ambientLoop:
      'The background stays almost still: the rain on the window is a fine, calm drizzle whose streaks crawl ' +
      'down the glass only imperceptibly slowly, the blurred city lights glow calm and steady with barely any twinkle, ' +
      'and the warm lamp glow holds completely steady. Nearly all visible motion comes from her.',
    ambientStill:
      'Rain streaks slide slowly down the window glass, droplets merging and racing; ' +
      'the blurred city lights twinkle faintly.',
    soundscape:
      'Soft steady rain patters against the window glass with low quiet room tone underneath, and a soft relaxed breath.',
    soundscapeWriting:
      'Soft steady rain patters against the window glass with low quiet room tone underneath, the faint scratch of a pen tip on paper, and a soft relaxed breath.',
  },

  'midnight-workstation': {
    name: '深夜工作台',
    anchor:
      '2D-animated lofi illustration, soft cel shading, deep blue-black night palette with warm orange neon accents. ' +
      'A static vertical medium shot of the exact scene in the reference image. Preserve exactly: ' +
      'the young woman with black hair in a messy bun with loose strands, navy blue knit sweater, thin gold pendant necklace; ' +
      'the ergonomic gaming chair; the wooden desk with an orange-backlit mechanical keyboard, a mouse on a black pad, ' +
      'over-ear headphones resting at the front right edge, a white ceramic mug with rising steam, and a monitor edge at the far right; ' +
      'the thin orange LED light strip running along the desk edges; ' +
      'the floor-to-ceiling window behind her showing a dark city skyline with scattered bokeh lights.',
    ambientLoop:
      'The background stays almost still: the steam rises from the ceramic mug in one thin, very slow, ' +
      'almost-steady ribbon, the orange keyboard backlight and LED strip hold a steady glow, ' +
      'and the distant city bokeh lights stay calm. Nearly all visible motion comes from her.',
    ambientStill:
      'Steam curls up slowly from the ceramic mug and dissipates; distant city bokeh lights twinkle softly.',
    soundscape:
      'Low quiet room tone with a faint monitor hum, soft distant city murmur behind the glass, and a soft relaxed breath.',
    soundscapeWriting:
      'Low quiet room tone with soft mechanical keyboard clicks, a faint monitor hum, and a soft relaxed breath.',
    // 深夜工作台的 focusing：敲代码叙事循环（写满屏幕→编译清屏→再写满），替代翻页
    focusingMotion:
      'She types steadily on the mechanical keyboard, lines of code gradually filling the dark monitor screen; ' +
      'her eyes scan the screen and she blinks rarely; her shoulders rise and fall with calm breathing. ' +
      'Around the middle of the video the finished code compiles and the screen scrolls to a fresh empty editor, ' +
      'and she keeps typing calmly. ' +
      'By the end of the video the editor is filled with code again, ' +
      'and she rests in the same typing pose as the first frame, hands on the keyboard.',
  },

  'sunny-classroom': {
    name: '阳光教室',
    anchor:
      '2D-animated lofi illustration, soft cel shading, warm cream-and-amber afternoon daylight palette. ' +
      'A static vertical medium shot of the exact scene in the reference image. Preserve exactly: ' +
      'the young woman with black hair in a messy bun with loose strands, navy blue knit sweater, thin gold pendant necklace; ' +
      'the wooden school desk with an open notebook, pens and a small sheet of paper on the left; ' +
      'the large classroom windows behind her glowing with golden afternoon sun and green leafy trees outside; ' +
      'the green chalkboard on the far left; soft dust motes drifting in the sunbeams.',
    ambientLoop:
      'The background stays almost still: the golden sunlight holds a warm, steady glow with only the gentlest flicker ' +
      'as a few leaves sway far outside the window, tiny dust motes drift very lazily through the sunbeams, ' +
      'and the curtain barely stirs. Nearly all visible motion comes from her.',
    ambientStill:
      'Golden sunlight flickers gently as leaves sway outside the window; dust motes drift slowly through the sunbeams.',
    soundscape:
      'A light breeze and muffled leaves outside the window with quiet classroom room tone, and a soft relaxed breath.',
    soundscapeWriting:
      'A light breeze and muffled leaves outside the window with quiet classroom room tone, the faint scratch of a pen tip on paper, and a soft relaxed breath.',
  },
};

// ── 状态运动设计 ────────────────────────────────────────────────────────────
// 共同基调：静止中的微动——lofi 壁纸式的催眠节奏，幅度小、速度慢。
// writing 变体：focusing 状态手部有笔触，配 soundscapeWriting。
const STATE_MOTION = {
  ready: {
    motion:
      'She sits still, gaze resting softly on the notebook ahead of her; ' +
      'she blinks slowly two or three times; ' +
      'her chest and shoulders rise and fall with a calm, unhurried breathing rhythm; ' +
      'a loose strand of hair sways almost imperceptibly. The notebook pages stay still. ' +
      'She keeps this exact pose from the first frame to the last frame.',
    writing: false,
  },
  // focusing：叙事循环 —— 写满一页 → 翻页 → 新页写满 → 回到开头（接缝=翻页）
  focusing: {
    motion:
      'She writes short, slow pen strokes across the open notebook, the handwriting gradually filling the page; ' +
      'her left hand rests flat on the desk; her eyes scan the page and she blinks rarely; ' +
      'her shoulders rise and fall with calm breathing. ' +
      'Around the middle of the video she pauses, lifts the written page with her right hand and gently turns it over ' +
      'to a fresh blank page, smoothing it flat, then resumes writing. ' +
      'By the end of the video the fresh page is filled with handwriting again, ' +
      'and she rests in the same writing pose as the first frame, pen tip touching the filled page.',
    writing: true,
  },
  paused: {
    motion:
      'She has paused writing, the pen resting loosely in her right hand just above the page; ' +
      'she gazes out the window with a soft, unfocused stare; ' +
      'she blinks slowly and breathes calmly; her head stays almost still; ' +
      'her hand and pen stay in the same position as the first frame, and she ends exactly as she began.',
    writing: false,
  },
  drinking: {
    motion:
      'She lifts the glass of water with her hand, brings it to her lips and takes one slow, unhurried sip, ' +
      'then lowers the glass back down to exactly its starting position on the desk; ' +
      'her eyes stay soft and her lips touch only the glass, never moving as if speaking.',
    writing: false,
  },
  resting: {
    motion:
      'She keeps both arms stretched up above her head, swaying very gently from side to side in a slow, relaxing stretch; ' +
      'her eyes stay closed; her shoulders lift as she breathes in and sink as she breathes out. ' +
      'In the final second her gentle sway subsides and her body settles back into the exact raised-stretch pose of the first frame, holding still.',
    writing: false,
  },
  completed: {
    motion:
      'She looks up from the desk directly toward the viewer, her gentle smile widening very slightly with quiet satisfaction; ' +
      'she gives one small, slow nod and blinks once; her hands rest still on the closed book.',
    writing: false,
  },
};

// 所有视频共用的负面清单。H3 官方指南：负面指令要具体，且响应异常有效。
const NEGATIVES =
  'No camera movement, no push in, no zoom, no cuts, no scene change, no new characters, no new objects, ' +
  'no text, no subtitles, no watermarks, no logos, no style change, no photorealism, no 3D render, ' +
  'no exaggerated expressions, no fast or jerky motion, no morphing of her face or hands, no extra fingers, ' +
  'no lip movement as if speaking — her lips stay closed. One continuous single shot.';

const LOOP_CLAUSE =
  'This is a seamless loop: the final frame must be identical to the first frame, so the video can repeat forever with a hard ' +
  'cut and no transition effect. She ends the video holding exactly the same pose as the opening frame, and the background ' +
  'stays completely stable so nothing jumps at the loop point.';

// ── 提示词组装 ─────────────────────────────────────────────────────────────
/**
 * @param {object} opts
 * @param {string} opts.skinKey    皮肤 slug（SKINS 的键）
 * @param {string} opts.state      状态名（STATE_SPECS 的键）
 * @param {number} opts.duration   时长（秒）
 * @param {boolean} [opts.loop]    覆盖默认循环设定（首尾帧是否同图）
 * @returns {{ prompt: string, loop: boolean }}
 */
export function buildPrompt({ skinKey, state, duration, loop }) {
  const skin = SKINS[skinKey];
  if (!skin) throw new Error(`未知皮肤: ${skinKey}`);
  const spec = STATE_SPECS[state];
  const motionSpec = STATE_MOTION[state];
  if (!spec || !motionSpec) throw new Error(`未知状态: ${state}`);

  const isLoop = loop ?? spec.loop;
  const ambient = isLoop ? skin.ambientLoop : skin.ambientStill;
  const soundscape = motionSpec.writing ? skin.soundscapeWriting : skin.soundscape;
  // focusing 允许皮肤覆写动作叙事（深夜工作台=敲代码清屏循环）
  const motionText =
    state === 'focusing' && skin.focusingMotion ? skin.focusingMotion : motionSpec.motion;
  const durationFixed = Number(duration).toFixed(2);

  // 官方指南第一部分：对齐指令（I2VA / FL2VA 固定句式）。
  const alignment = isLoop
    ? `For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced. ` +
      `At ${durationFixed} seconds into the target video, <Picture 2> (from the final shot) is fully referenced.`
    : `For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced.`;

  const description =
    `integrated_multimodal_description: ` +
    `[Shot 1] ${skin.anchor} ` +
    `${motionText} ${ambient} ` +
    `The camera is a Static Shot with no movement; only the living details inside the frame move. ` +
    (isLoop ? `${LOOP_CLAUSE} ` : '') +
    `She is a quiet, unobtrusive background presence — her movements stay small, gentle and unhurried, ` +
    `the kind the eye can rest beside for a whole study session without being pulled toward her. ` +
    `All motion stays minimal, slow and hypnotic, like a living lofi wallpaper. ${NEGATIVES}`;

  const prompt = [
    alignment,
    '',
    description,
    '',
    `overall_soundscape: ${soundscape}`,
    '',
    'non_diegetic_music: N/A',
  ].join('\n');

  return { prompt, loop: isLoop };
}
