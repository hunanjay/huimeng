/**
 * 画布模板：一个模板 = 一张预连好的节点图。
 *
 * 节点分两类：
 * - 生成节点（image / video）：真的会调模型（方舟 Seedream / Seedance）
 * - 规划节点（context / llm_split / fanout / anchor / storyboard / hitl / concat）：
 *   流程、参数与人审卡点，画布上可编辑，暂不触发模型调用
 *
 * 布局坐标是「世界坐标」，实例化时整体平移；同一行按 360 间距排开。
 */

/* ===== 模板 1：剧本 → 成片（剧本：写实水墨 · 剑客 vs 方天画戟女战士） ===== */
const SCRIPT_TO_VIDEO = {
  id: 'script-to-video',
  name: '剧本 → 成片流水线',
  badge: '推荐',
  summary: '剧本拆解 → 角色定妆锁定 → 分镜参考图批量生成 → 人工审核门禁 → 首尾帧图生视频 → 成片合成',
  tags: ['剧本拆解', '人审卡点', 'Map 扇出', 'Reduce 汇合'],
  version: 'v1',
  nodes: [
    {
      id: 'ctx', kind: 'context', x: 60, y: 260,
      data: {
        title: '全局配置与画风总线',
        rawScript: '写实水墨风格。古寺山门前，青衫剑客与手持方天画戟的女战士相对而立，山雾未散。两人交手三个回合：戟锋横扫、剑身相格，墨色飞白在雨雾里炸开，最后定格在剑尖抵住戟杆、二人近身对视的瞬间。',
        globalStyle: 'realistic chinese ink wash painting, xuan paper texture, monochrome with subtle mineral pigment, dry brush strokes, flying-white ink splashes, misty mountains, cinematic composition, high detail',
        ratio: '16:9', baseSeed: 420998,
      },
    },
    {
      id: 'llm', kind: 'llm_split', x: 360, y: 260,
      data: {
        title: '剧本拆解 · 分镜与资产',
        model: 'doubao-seed-2-1（方舟）',
        systemPrompt: '将剧本拆解为结构化 JSON，保持「写实水墨」的统一画风；提取 1 个核心主角设定词（character_prompt），以及 N 个连续分镜（shots: shot_id, visual_prompt, motion_prompt, duration_sec）。',
      },
    },
    {
      id: 'anchor', kind: 'anchor', x: 660, y: 60,
      data: {
        title: '主角定妆照（双角色）',
        extraPrompt: 'character sheet, front view, neutral background, clear facial features, ink wash edges',
        model: 'Seedream（方舟）', steps: 28, ratio: '1:1',
        inputs: { characterPrompt: '写实水墨风，青衫剑客，束发，手持长剑，衣袂带风，宣纸肌理' },
        characters: [
          { id: 'char-1', name: '青衫剑客', prompt: '写实水墨风，年轻东亚男性剑客，束发高髻，青灰色粗布长衫，腰系素带，手持无装饰铁剑，清俊冷峻' },
          { id: 'char-2', name: '方天画戟女战士', prompt: '写实水墨风，年轻东亚女性战士，高束马尾，暗纹皮甲与兽皮护肩，手持玄铁方天画戟，英气锐利' },
        ],
      },
    },
    { id: 'fanout', kind: 'fanout', x: 660, y: 440, data: { title: '分镜列表扇出（Map）' } },
    {
      id: 'keyframes', kind: 'storyboard', x: 960, y: 240,
      data: {
        title: '分镜参考图 · 批量',
        consistency: 'flux_redux_plus_pulid', consistencyWeight: 0.85,
        model: 'Seedream（方舟）', ratio: '16:9', count: 3,
        shots: [
          { id: 'shot-1', start: 0, end: 4, visual: '古寺山门前，青衫剑客按剑逼近，女战士横持方天画戟，墨色远山与薄雾', motion: '镜头缓推，雾气在两人之间流动', duration: 4 },
          { id: 'shot-2', start: 4, end: 8, visual: '方天画戟带着墨色飞白横扫，剑身相格，积水与落叶被气劲卷起', motion: '快速横移跟拍，撞击瞬间短暂定格', duration: 4 },
          { id: 'shot-3', start: 8, end: 12, visual: '剑尖抵住戟杆，二人近身对视，宣纸肌理与墨点悬在半空', motion: '缓慢环绕半圈，收势留白', duration: 4 },
        ],
      },
    },
    {
      id: 'hitl', kind: 'hitl', x: 1260, y: 240,
      data: {
        title: '人工审核门禁',
        note: '逐镜勾选，通过的分镜才往下游走；不放行的可以单张重抽。重点看水墨质感与两人动作是否连贯。',
        shots: [{ id: 'shot-1', ok: true }, { id: 'shot-2', ok: true }, { id: 'shot-3', ok: false }],
      },
    },
    {
      id: 'videos', kind: 'video', x: 1560, y: 240,
      data: {
        text: '两人交手的长镜头，水墨飞白与雾气随招式散开，镜头跟随剑戟碰撞，保持写实水墨风格与主角形象一致',
        ratio: '16:9', duration: 5, status: 'idle',
      },
    },
    {
      id: 'concat', kind: 'concat', x: 1860, y: 240,
      data: { title: '成片合成导出', transition: 'crossfade 0.2s', format: 'mp4', crf: 18 },
    },
  ],
  edges: [
    ['ctx', 'llm'], ['ctx', 'anchor'], ['llm', 'anchor'], ['llm', 'fanout'],
    ['fanout', 'keyframes'], ['anchor', 'keyframes'], ['ctx', 'keyframes'],
    ['fanout', 'hitl'], ['keyframes', 'hitl'],
    ['hitl', 'videos'], ['ctx', 'videos'], ['videos', 'concat'],
  ].map(([source, target]) => ({ source, target })),
};

/* ===== 模板 2：单镜头快速出片（同一主题的最小链路） ===== */
const QUICK_SHOT = {
  id: 'quick-shot',
  name: '单镜头快速出片',
  summary: '一段描述先出图，再把图接进视频节点做首帧，最小闭环',
  tags: ['快速上手'],
  version: 'v1',
  nodes: [
    { id: 'text', kind: 'text', x: 60, y: 200, data: { text: '写实水墨风：竹林里，青衫剑客与手持方天画戟的女战士对峙，墨色飞白，宣纸肌理，电影感构图' } },
    { id: 'image', kind: 'image', x: 360, y: 200, data: { text: '把上面的画面做成分镜参考图，保持写实水墨质感与宣纸颗粒', ratio: '16:9', status: 'idle' } },
    { id: 'video', kind: 'video', x: 660, y: 200, data: { text: '剑戟相交，墨色炸开，镜头快速跟拍，飞白四溅', ratio: '16:9', duration: 5, status: 'idle' } },
  ],
  edges: [{ source: 'text', target: 'image' }, { source: 'image', target: 'video' }],
};

/* ===== 模板 3：角色一致性定妆（剑客） ===== */
const CHARACTER_SHEET = {
  id: 'character-sheet',
  name: '角色一致性定妆',
  summary: '先定妆锚点锁定主角形象，再沿同一角色继续出图',
  tags: ['一致性锚点'],
  version: 'v1',
  nodes: [
    { id: 'ctx', kind: 'context', x: 60, y: 240, data: { title: '角色设定', rawScript: '男主：写实水墨风剑客，青灰长衫、束发、右手长剑，眉骨有一道旧伤；气质克制。', globalStyle: 'realistic ink wash, xuan paper texture, dry brush, monochrome with subtle pigment', ratio: '9:16', baseSeed: 20251118 } },
    { id: 'llm', kind: 'llm_split', x: 360, y: 240, data: { title: '设定词提取', model: 'doubao-seed-2-1（方舟）', systemPrompt: '从角色设定里提取 1 个稳定的角色描述词，保留写实水墨风格关键词，去掉镜头/光照相关描述。' } },
    { id: 'anchor', kind: 'anchor', x: 660, y: 120, data: { title: '定妆照锚点', extraPrompt: 'character sheet, front view, neutral background, ink wash edges', model: 'Seedream（方舟）', steps: 28, ratio: '1:1', inputs: { characterPrompt: '写实水墨风，青衫剑客，束发，手持长剑，眉骨旧伤' } } },
    { id: 'sheet', kind: 'image', x: 960, y: 120, data: { text: '同一剑客角色，四种角度的水墨定妆参考图', ratio: '16:9', status: 'idle' } },
  ],
  edges: [{ source: 'ctx', target: 'llm' }, { source: 'ctx', target: 'anchor' }, { source: 'llm', target: 'anchor' }, { source: 'anchor', target: 'sheet' }],
};

/* ===== 模板 4：童年夏日回忆短片（4 镜 × 5 秒 = 20 秒） ===== */
const CHILDHOOD_SUMMER = {
  id: 'childhood-summer',
  name: '童年夏日 · 回忆短片',
  badge: '新',
  summary: '4 个 5 秒镜头：逗小鸡 → 小卖部买冰棍 → 河边打水仗 → 夕阳回家，含旁白与对白',
  tags: ['怀旧写实', '旁白对白', '4 镜 20 秒'],
  version: 'v1',
  nodes: [
    {
      id: 'ctx', kind: 'context', x: 60, y: 260,
      data: {
        title: '全局配置与画风总线',
        rawScript: [
          '0–5秒｜夏日的院子',
          '画面：小男孩穿着旧衣服，蹲在土院子里逗弄小鸡，阳光洒在他的脸上，远处奶奶正在晾衣服。',
          '旁白：小时候，夏天好像特别长。',
          '',
          '5–10秒｜村里的快乐',
          '画面：男孩拿着五毛钱跑到村口小卖部，买了一根冰棍，几个小伙伴在门口等他。',
          '小伙伴喊：快点！我们去河边！',
          '男孩笑着跑过去。',
          '',
          '10–15秒｜童年的下午',
          '画面：几个孩子光着脚在泥土路上追逐，河边打水仗，男孩笑得满脸通红。',
          '旁白：一根冰棍，几个伙伴，就能开心一整个下午。',
          '',
          '15–20秒｜夕阳回家',
          '画面：夕阳下，男孩背着小手走在乡间土路上，远处奶奶站在院门口喊他回家吃饭。',
          '奶奶：小军！回来吃饭啦！',
          '男孩：来啦！',
          '旁白：那时候，总盼着长大。长大以后，才发现最想回去的，就是小时候。',
        ].join('\n'),
        globalStyle: 'nostalgic realistic film, warm summer afternoon sunlight, 35mm grain, shallow depth of field, rural chinese village, golden hour, natural skin tones',
        ratio: '16:9', baseSeed: 20251118,
      },
    },
    {
      id: 'llm', kind: 'llm_split', x: 360, y: 260,
      data: {
        title: '剧本拆解 · 分镜与资产',
        model: 'doubao-seed-2-1（方舟）',
        systemPrompt: '把剧本拆成严格 4 个分镜，时间戳固定为 0-5 / 5-10 / 10-15 / 15-20 秒；每镜输出 visual（画面）、motion（人物动作与镜头，写清是真实速度、不要慢动作）、narration（该镜旁白，没有就留空）、dialogue（该镜对白，格式「角色：台词」，没有就留空）。同时识别本场所有主要角色并给独立定妆描述。',
      },
    },
    {
      id: 'anchor', kind: 'anchor', x: 660, y: 60,
      data: {
        title: '主角定妆照（双角色）',
        extraPrompt: 'character sheet, front view, neutral background, clear facial features, natural film look',
        model: 'Seedream（方舟）', steps: 28, ratio: '1:1',
        inputs: { characterPrompt: '7-8岁中国农村小男孩，短寸头，旧白背心配深色短裤，晒得微黑，笑起来眼睛弯弯' },
        characters: [
          { id: 'char-1', name: '小男孩小军', prompt: '7-8岁中国农村小男孩，短寸头，旧白背心配深色短裤，晒得微黑，笑起来眼睛弯弯' },
          { id: 'char-2', name: '奶奶', prompt: '60多岁中国农村奶奶，灰白短发挽成髻，深蓝布褂配围裙，手掌粗糙，面容慈祥' },
        ],
      },
    },
    { id: 'fanout', kind: 'fanout', x: 660, y: 440, data: { title: '分镜列表扇出（Map）' } },
    {
      id: 'keyframes', kind: 'storyboard', x: 960, y: 240,
      data: {
        title: '分镜参考图 · 批量',
        consistency: 'flux_redux_plus_pulid', consistencyWeight: 0.85,
        model: 'Seedream（方舟）', ratio: '16:9', count: 4,
        shots: [
          { id: 'shot-1', start: 0, end: 5, visual: '夏日午后，土院子里，小男孩蹲着逗弄几只小鸡，阳光洒在脸上，远处奶奶在晾衣服', motion: '镜头缓慢前推，真实速度', narration: '小时候，夏天好像特别长。', dialogue: '', duration: 5 },
          { id: 'shot-2', start: 5, end: 10, visual: '村口小卖部，男孩攥着五毛钱买冰棍，几个小伙伴在门口等着，笑着招呼他', motion: '跟拍男孩跑向小卖部，真实速度', narration: '', dialogue: '小伙伴：快点！我们去河边！', duration: 5 },
          { id: 'shot-3', start: 10, end: 15, visual: '泥土地上光脚追逐的孩子，河边打水仗，男孩笑得满脸通红，水花四溅', motion: '手持晃动跟拍，动作干脆，真实速度', narration: '一根冰棍，几个伙伴，就能开心一整个下午。', dialogue: '', duration: 5 },
          { id: 'shot-4', start: 15, end: 20, visual: '夕阳下的乡间土路，男孩背着手往家走，远处奶奶站在院门口喊他吃饭，暖橙色逆光', motion: '背影缓跟，真实速度', narration: '那时候，总盼着长大。长大以后，才发现最想回去的，就是小时候。', dialogue: '奶奶：小军！回来吃饭啦！ 男孩：来啦！', duration: 5 },
        ],
      },
    },
    {
      id: 'hitl', kind: 'hitl', x: 1260, y: 240,
      data: {
        title: '人工审核门禁',
        note: '逐镜勾选：重点看童年氛围、两个角色是否一致、动作速度是否自然（不要慢放感）。',
        shots: [{ id: 'shot-1', ok: true }, { id: 'shot-2', ok: true }, { id: 'shot-3', ok: true }, { id: 'shot-4', ok: true }],
      },
    },
    {
      id: 'videos', kind: 'video', x: 1560, y: 240,
      data: {
        text: '真实时间流速，人物动作自然，不要慢动作、不要慢放；镜头跟随人物，保留夏日午后暖光与胶片颗粒',
        ratio: '16:9', duration: 5, status: 'idle',
      },
    },
    {
      id: 'concat', kind: 'concat', x: 1860, y: 240,
      data: { title: '成片合成导出', transition: 'cut', format: 'mp4', crf: 18, speed: 1.25 },
    },
  ],
  edges: [
    ['ctx', 'llm'], ['ctx', 'anchor'], ['llm', 'anchor'], ['llm', 'fanout'],
    ['fanout', 'keyframes'], ['anchor', 'keyframes'], ['ctx', 'keyframes'],
    ['fanout', 'hitl'], ['keyframes', 'hitl'],
    ['hitl', 'videos'], ['ctx', 'videos'], ['videos', 'concat'],
  ].map(([source, target]) => ({ source, target })),
};
/* ===== 案例：童年夏日（已出片，打开就是成片，也能从任意节点重跑） ===== */
const CHILDHOOD_CASE = {
  id: 'childhood-summer-case',
  name: '童年夏日 · 案例（已出片）',
  badge: '案例',
  summary: '20 秒怀旧短片成品：双角色定妆、4 张分镜图、4 段视频、1.25x 成片，全部已生成',
  tags: ['成品案例', '定妆一致', '可重跑'],
  version: 'v1',
  nodes: [
    {
      id: 'ctx', kind: 'context', x: 60, y: 260,
      data: {
        title: '全局配置与画风总线',
        rawScript: [
          '0–5秒｜夏日的院子',
          '画面：小男孩穿着旧衣服，蹲在土院子里逗弄小鸡，阳光洒在他的脸上，远处奶奶正在晾衣服。',
          '旁白：小时候，夏天好像特别长。',
          '',
          '5–10秒｜村里的快乐',
          '画面：男孩拿着五毛钱跑到村口小卖部，买了一根冰棍，几个小伙伴在门口等他。',
          '小伙伴喊：快点！我们去河边！',
          '男孩笑着跑过去。',
          '',
          '10–15秒｜童年的下午',
          '画面：几个孩子在晒谷场上光脚追逐打闹，扬起细土，男孩笑得满脸通红。',
          '旁白：一根冰棍，几个伙伴，就能开心一整个下午。',
          '',
          '15–20秒｜夕阳回家',
          '画面：夕阳下，男孩背着小手走在乡间土路上，远处奶奶站在院门口喊他回家吃饭。',
          '奶奶：小军！回来吃饭啦！',
          '男孩：来啦！',
          '旁白：那时候，总盼着长大。长大以后，才发现最想回去的，就是小时候。',
        ].join('\n'),
        globalStyle: 'nostalgic realistic film, warm summer afternoon sunlight, 35mm grain, shallow depth of field, rural chinese village, golden hour, natural skin tones',
        ratio: '16:9', baseSeed: 20251118,
      },
    },
    {
      id: 'llm', kind: 'llm_split', x: 360, y: 260,
      data: {
        title: '剧本拆解 · 分镜与资产',
        model: 'doubao-seed-2-1（方舟）',
        systemPrompt: '把剧本拆成严格 4 个分镜，时间戳固定为 0-5 / 5-10 / 10-15 / 15-20 秒；每镜输出 visual、motion（注明真实速度）、narration、dialogue。避免儿童涉水、泳装等敏感场景。',
        characters: [
          { id: 'char-1', name: '小男孩小军', prompt: '7-8岁中国农村小男孩，短寸头，旧白背心配深色短裤，晒得微黑，笑起来眼睛弯弯' },
          { id: 'char-2', name: '奶奶', prompt: '60多岁中国农村奶奶，灰白短发挽成髻，深蓝布褂配围裙，面容慈祥' },
        ],
      },
    },
    {
      id: 'anchor', kind: 'anchor', x: 660, y: 60,
      data: {
        title: '主角定妆照（双角色）',
        extraPrompt: 'character sheet, front view, neutral background, clear facial features, natural film look',
        model: 'Seedream（方舟）', steps: 28, ratio: '1:1', status: 'done',
        inputs: { characterPrompt: '7-8岁中国农村小男孩，短寸头，旧白背心配深色短裤，晒得微黑，笑起来眼睛弯弯' },
        characters: [
          { id: 'char-1', name: '小男孩小军', prompt: '7-8岁中国农村小男孩，短寸头，旧白背心配深色短裤，晒得微黑，笑起来眼睛弯弯' },
          { id: 'char-2', name: '奶奶', prompt: '60多岁中国农村奶奶，灰白短发挽成髻，深蓝布褂配围裙，面容慈祥' },
        ],
        portraits: [
          { name: '小男孩小军', url: '/api/files/b015e2c3-bf0b-4d17-b711-71668ea002b3.jpeg' },
          { name: '奶奶', url: '/api/files/f012a9d7-9838-4cd7-8333-2997c69af0d1.jpeg' },
        ],
      },
    },
    { id: 'fanout', kind: 'fanout', x: 660, y: 440, data: { title: '分镜列表扇出（Map）' } },
    {
      id: 'keyframes', kind: 'storyboard', x: 960, y: 240,
      data: {
        title: '分镜参考图 · 批量',
        consistency: 'flux_redux_plus_pulid', consistencyWeight: 0.85,
        model: 'Seedream（方舟）', ratio: '16:9', count: 4, status: 'done',
        shots: [
          { id: 'shot-1', start: 0, end: 5, duration: 5, visual: '夏日午后，土院子里，小男孩蹲着逗弄几只小鸡，阳光洒在脸上，远处奶奶在晾衣服', motion: '镜头缓慢前推，真实速度', narration: '小时候，夏天好像特别长。', dialogue: '', imageUrl: '/api/files/cbb34a51-b622-41d3-9c0f-f132248366af.jpeg' },
          { id: 'shot-2', start: 5, end: 10, duration: 5, visual: '村口小卖部，男孩攥着五毛钱买冰棍，几个小伙伴在门口等着，笑着招呼他', motion: '跟拍男孩跑向小卖部，真实速度', narration: '', dialogue: '小伙伴：快点！我们去河边！', imageUrl: '/api/files/90787fde-ef20-4716-a83f-fc3059ab0279.jpeg' },
          { id: 'shot-3', start: 10, end: 15, duration: 5, visual: '晒谷场上，几个孩子光脚追逐打闹，扬起细土，男孩笑得满脸通红', motion: '手持跟拍，动作干脆，真实速度', narration: '一根冰棍，几个伙伴，就能开心一整个下午。', dialogue: '', imageUrl: '/api/files/b488dd10-7fbf-4445-a414-03f975132043.jpeg' },
          { id: 'shot-4', start: 15, end: 20, duration: 5, visual: '夕阳下的乡间土路，男孩背着手往家走，远处奶奶站在院门口喊他吃饭，暖橙色逆光', motion: '背影缓跟，真实速度', narration: '那时候，总盼着长大。长大以后，才发现最想回去的，就是小时候。', dialogue: '奶奶：小军！回来吃饭啦！ 男孩：来啦！', imageUrl: '/api/files/30186e39-6759-4224-b40d-294155a9c5fb.jpeg' },
        ],
      },
    },
    {
      id: 'hitl', kind: 'hitl', x: 1260, y: 240,
      data: {
        title: '人工审核门禁',
        note: '逐镜勾选：重点看童年氛围、两个角色是否一致、动作速度是否自然（不要慢放感）。',
        shots: [{ id: 'shot-1', ok: true }, { id: 'shot-2', ok: true }, { id: 'shot-3', ok: true }, { id: 'shot-4', ok: true }],
      },
    },
    {
      id: 'videos', kind: 'video', x: 1560, y: 240,
      data: {
        text: '真实时间流速，人物动作自然，不要慢动作、不要慢放；镜头跟随人物，保留夏日午后暖光与胶片颗粒',
        ratio: '16:9', duration: 5, status: 'done',
        segments: [
          { shotId: 'shot-1', url: '/api/files/60d7a3d8-e0a0-4d3d-a204-95f821a82cfe.mp4' },
          { shotId: 'shot-2', url: '/api/files/70a1d183-403b-42b8-8bec-70fff47ad550.mp4' },
          { shotId: 'shot-3', url: '/api/files/d60394dc-3f3d-434c-967f-eb35880f4eda.mp4' },
          { shotId: 'shot-4', url: '/api/files/e784aaf6-c81a-4bda-b721-80bddbbf6b2c.mp4' },
        ],
      },
    },
    {
      id: 'concat', kind: 'concat', x: 1860, y: 240,
      data: {
        title: '成片合成导出', transition: 'cut', format: 'mp4', crf: 18, speed: 1.25, status: 'done',
        resultUrl: '/api/files/concat-1429d439-b8cc-4fff-b27d-79ccd83825e2.mp4', segmentCount: 4,
      },
    },
  ],
  edges: [
    ['ctx', 'llm'], ['ctx', 'anchor'], ['llm', 'anchor'], ['llm', 'fanout'],
    ['fanout', 'keyframes'], ['anchor', 'keyframes'], ['ctx', 'keyframes'],
    ['fanout', 'hitl'], ['keyframes', 'hitl'],
    ['hitl', 'videos'], ['ctx', 'videos'], ['videos', 'concat'],
  ].map(([source, target]) => ({ source, target })),
};
export const WORKFLOW_TEMPLATES = [SCRIPT_TO_VIDEO, CHILDHOOD_SUMMER, CHILDHOOD_CASE, QUICK_SHOT, CHARACTER_SHEET];

export const templateById = id => WORKFLOW_TEMPLATES.find(item => item.id === id) || null;

/** 模板里节点 id 是本地短名（ctx/llm…），实例化要换成全局唯一 id */
export const instanceId = (templateId, nodeId) => `${templateId}:${nodeId}`;
