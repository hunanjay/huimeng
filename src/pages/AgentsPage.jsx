import { useState } from 'react';
import './AgentsPage.css';

const categories = ['专业影视', '商业广告', '短剧漫剧', '动漫游戏', '自媒体创作', '音乐MV', '通用技能'];
const skills = [
  ['选角Casting', '你的专属选角导演，一键为你挑选最合适的角色', '专业影视'],
  ['是枝裕和电影美学', '是枝裕和电影美学。用日常写实的生活肌理，包裹克制又轻盈的情感', '专业影视'],
  ['电影质感画面专业生成', '一句大白话就能生成超质感电影级多风格图片', '专业影视'],
  ['AI电影镜头设计师', '把简单的场景设计成专业电影级镜头语言', '专业影视'],
  ['无厘头喜剧', '将任意主题转成无厘头创意短片，支持剧本改写和照片玩梗。', '短剧漫剧'],
  ['影视打斗特效skill', '一句话生成角色人物影视特效，支持文字参考图/视频', '专业影视'],
  ['仙侠氛围美学短片', '仙侠氛围美学短片', '短剧漫剧'],
  ['岩井俊二电影美学', '细腻、透明的电影画面与情绪表达', '专业影视'],
  ['产品广告创意导演', '快速构思有记忆点的产品广告脚本和分镜', '商业广告'],
];

export default function AgentsPage() {
  const [category, setCategory] = useState('专业影视');
  const [selected, setSelected] = useState(null);
  const filtered = skills.filter(([, , group]) => category === '通用技能' || group === category);
  return <main className="agents-page">
    <aside className="skill-panel">
      <h1>技能</h1>
      <div className="skill-categories">{categories.map(item => <button key={item} className={category === item ? 'chosen' : ''} onClick={() => setCategory(item)}>{item}</button>)}</div>
      <div className="skill-list">{filtered.map(([name, description]) => <button key={name} className={`skill-card ${selected === name ? 'selected' : ''}`} onClick={() => setSelected(name)}><strong>{name}</strong><span>{description}</span></button>)}</div>
    </aside>
    <section className="agent-workspace">{selected ? <><h2>{selected}</h2><p>已选择技能，描述你的创作想法。</p><textarea aria-label="描述创作想法" placeholder="说说你想创作什么……" /></> : <p>选左边一个技能，把想法说给它。</p>}</section>
  </main>;
}
