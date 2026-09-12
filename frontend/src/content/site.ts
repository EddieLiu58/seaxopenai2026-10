export const site = { name: "Seax Studio", tagline: "讓想法，成為好用的體驗。" };
export const categories = ["全部", "品牌網站", "產品介面"] as const;
export type Category = (typeof categories)[number];
export const projects = [
  { id: "tide", name: "潮汐 Tide", category: "品牌網站", summary: "一個關於海岸、旅行與慢下來的品牌概念。", word: "tide", theme: "tide", note: "留一點時間，給海。" },
  { id: "form", name: "有序 Form", category: "產品介面", summary: "把日常計畫整理成清楚、專注的工作空間。", word: "form.", theme: "form", note: "為重要的事，留出空間。" },
  { id: "mori", name: "森日 Mori", category: "品牌網站", summary: "用自然的色彩，呈現植物與生活的關係。", word: "mori", theme: "mori", note: "讓日常，自然發生。" },
] as const;
export const faqs = [
  { question: "這個網站目前包含哪些內容？", answer: "目前是品牌網站的前端起始版本，包含首頁、概念作品分類、設計理念與常見問題。所有作品皆為展示用途，可替換成你的實際內容。" },
  { question: "可以改成自己的品牌嗎？", answer: "可以。品牌名稱、首頁文字、作品資料、色彩與字體皆可調整，也能依產品需求新增頁面與元件。" },
  { question: "手機和平板也能使用嗎？", answer: "版面依螢幕寬度調整，並提供鍵盤焦點、清楚的操作標籤及減少動態效果支援。" },
];
