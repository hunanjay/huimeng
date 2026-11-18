import { useEffect, useRef, useState } from 'react';
import { Send, Sparkles } from 'lucide-react';
import { api } from '../api.js';
import './AgentsPage.css';

const categories = ['专业影视', '商业广告', '短剧漫剧', '动漫游戏', '自媒体创作', '音乐MV', '通用技能'];

const skills = [
  { name: '选角Casting', description: '你的专属选角导演，一键为你挑选最合适的角色', category: '专业影视', hint: '描述角色气质、年龄和戏份，我帮你列出候选演员画像与适配理由。' },
  { name: '是枝裕和电影美学', description: '是枝裕和电影美学。用日常写实的生活肌理，包裹克制又轻盈的情感', category: '专业影视', hint: '给我一个家庭场景，我按是枝裕和的日常质感拆镜头。' },
  { name: '电影质感画面专业生成', description: '一句大白话就能生成超质感电影级多风格图片', category: '专业影视', hint: '说一句你想看到的画面，我补全成电影级提示词。' },
  { name: 'AI电影镜头设计师', description: '把简单的场景设计成专业电影级镜头语言', category: '专业影视', hint: '描述场景与人物走位，我给出景别、机位与运镜方案。' },
  { name: '影视打斗特效skill', description: '一句话生成角色人物影视特效，支持文字参考图/视频', category: '专业影视', hint: '说清角色与招式，我拆解特效镜头与节奏。' },
  { name: '岩井俊二电影美学', description: '细腻、透明的电影画面与情绪表达', category: '专业影视', hint: '给我一个青春场景，我写出柔光、逆光与留白的镜头意象。' },
  { name: '产品广告创意导演', description: '快速构思有记忆点的产品广告脚本和分镜', category: '商业广告', hint: '告诉我产品与卖点，我出三条不同调性的广告创意。' },
  { name: '品牌TVC脚本', description: '15 秒 / 30 秒品牌片脚本与分镜节奏', category: '商业广告', hint: '说清品牌调性与投放平台，我按秒数拆脚本。' },
  { name: '无厘头喜剧', description: '将任意主题转成无厘头创意短片，支持剧本改写和照片玩梗。', category: '短剧漫剧', hint: '丢一个正经主题过来，我把它改写成无厘头短片。' },
  { name: '仙侠氛围美学短片', description: '仙侠氛围美学短片', category: '短剧漫剧', hint: '给我一句招式或场景，我铺仙侠氛围的镜头与配色。' },
  { name: '短剧爆点编剧', description: '三秒一个钩子，一集一个反转', category: '短剧漫剧', hint: '说说你的故事线，我帮你埋钩子、设计反转。' },
  { name: '动漫分镜稿', description: '日式动漫分镜与演出节奏建议', category: '动漫游戏', hint: '给我一段剧情，我出分镜格与演出提示。' },
  { name: '游戏CG导演', description: '游戏宣传片的镜头语言与节奏设计', category: '动漫游戏', hint: '告诉我世界观与卖点，我设计 CG 分镜结构。' },
  { name: '口播脚本改写', description: '把干货写成有钩子的口播稿', category: '自媒体创作', hint: '粘一段稿子，我改成更顺、更有钩子的口播版本。' },
  { name: '音乐MV分镜', description: '按节拍铺镜头的 MV 分镜表', category: '音乐MV', hint: '给我歌曲情绪与段落，我按 8 拍一镜铺分镜。' },
  { name: '万能提示词优化', description: '把口水话打磨成可出片的结构化提示词', category: '通用技能', hint: '把你的想法原样发我，我整理成结构化提示词。' },
  { name: '分镜表生成', description: '一句话生成可执行的分镜表', category: '通用技能', hint: '给我剧情梗概，我出镜号、景别、时长与提示词。' },
];

export default function AgentsPage() {
  const [category, setCategory] = useState(null);
  const [selected, setSelected] = useState(skills[0].name);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState(false);
  const threadRef = useRef(null);

  const active = skills.find(skill => skill.name === selected) || skills[0];
  const visible = category ? skills.filter(skill => skill.category === category) : skills;

  // 切换技能时从后端拉这段技能的对话历史
  useEffect(() => {
    let cancelled = false;
    setMessages([]);
    api.listMessages(selected)
      .then(data => {
        if (cancelled) return;
        setMessages(data.items.map(item => ({ id: item.id, role: item.role, text: item.text })));
      })
      .catch(() => { /* 后端未启动时保持空对话 */ });
    return () => { cancelled = true; };
  }, [selected]);

  useEffect(() => {
    const thread = threadRef.current;
    if (thread) thread.scrollTop = thread.scrollHeight;
  }, [messages, pending]);

  const send = async () => {
    const text = draft.trim();
    if (!text || pending) return;
    setMessages(list => [...list, { id: `local-${Date.now()}`, role: 'user', text }]);
    setDraft('');
    setPending(true);
    try {
      const result = await api.sendMessage(active.name, text);
      setMessages(list => [...list, { id: result.reply.id, role: 'agent', text: result.reply.text }]);
    } catch (error) {
      setMessages(list => [...list, { id: `err-${Date.now()}`, role: 'agent', text: `出错了：${error.message}` }]);
    } finally {
      setPending(false);
    }
  };

  const pickSkill = name => {
    if (name === selected) return;
    setPending(false);
    setMessages([]);
    setDraft('');
    setSelected(name);
  };

  const onKeyDown = event => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      send();
    }
  };

  return <main className="agents-page">
    <aside className="skill-panel">
      <h2 className="panel-title">技能</h2>
      <div className="skill-categories">
        {categories.map(item => <button key={item} type="button"
          className={category === item ? 'chosen' : ''}
          onClick={() => setCategory(current => (current === item ? null : item))}>{item}</button>)}
      </div>
      <div className="skill-list" role="listbox" aria-label="技能列表">
        {visible.map(skill => <button key={skill.name} type="button" role="option" aria-selected={selected === skill.name}
          className={`skill-card ${selected === skill.name ? 'selected' : ''}`}
          onClick={() => pickSkill(skill.name)}>
          <strong>{skill.name}</strong>
          <span>{skill.description}</span>
        </button>)}
      </div>
    </aside>

    <section className="agent-console">
      <header className="console-head">
        <h1>{active.name}</h1>
        <p>{active.description}</p>
      </header>
      <div className="chat-thread" ref={threadRef}>
        {messages.length === 0 && !pending ? <div className="chat-empty">
          <Sparkles size={22} />
          <strong>和「{active.name}」开始对话</strong>
          <p>{active.hint}</p>
        </div> : <>
          {messages.map(message => <div key={message.id} className={`msg ${message.role}`}>
            <div className="bubble">{message.text}</div>
            <small>{message.role === 'user' ? '我' : active.name}</small>
          </div>)}
          {pending && <div className="msg agent"><div className="bubble typing"><i /><i /><i /></div></div>}
        </>}
      </div>
      <footer className="composer">
        <div className="composer-box">
          <textarea rows={2} value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={onKeyDown}
            placeholder="说说要做什么" aria-label="说说要做什么" />
        </div>
        <button type="button" className="send-btn" onClick={send} disabled={!draft.trim() || pending}>
          <Send size={16} />发送
        </button>
      </footer>
    </section>
  </main>;
}
