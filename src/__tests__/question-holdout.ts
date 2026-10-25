// 留出集：在规则写完之后才编写，未用于调参，用来估计真实泛化效果。
export const HOLDOUT_Q: string[] = [
  "你们公司的技术栈主要是什么", "这个月的 KPI 完成了吗", "老师能再放慢一点讲吗",
  "第二个方程怎么解", "你最近在读什么书", "这次活动预计来多少人", "谁负责写会议纪要",
  "你为什么想转行做产品", "能说说你在上家公司的主要贡献吗", "你觉得最难的部分是什么",
  "数据库索引失效有哪些情况", "这个需求优先级高不高", "咱们是先做 iOS 还是 Android",
  "你能接受出差吗", "考试允许带计算器吗", "这里为什么要取对数", "请简单介绍一下你的教育背景",
  "讲讲你遇到过最难的 bug", "你怎么保证代码质量", "这个价格还能再谈吗", "这周五有空吗",
  "你对我们公司了解多少", "这个模型的准确率有多高", "还有别的问题吗", "那测试环境呢",
  "What would you do differently next time", "How do you handle tight deadlines",
  "Did everyone get the slides", "Is there a recording of the lecture", "Tell us about your biggest weakness",
  "Can we push this to next week", "Why is the sky blue", "Which chapter is this from",
  "Explain how garbage collection works", "You're joining us on Monday, right?",
  "老师这个 formula 是怎么来的", "这个 bug 能不能 hotfix", "你会 Python 吗",
  "说一下你对 CAP 理论的理解", "这段 code 为什么会 crash",
];
export const HOLDOUT_N: string[] = [
  "我们公司主要用 Java", "这个月的 KPI 已经完成了", "我会讲慢一点", "第二个方程用代入法解",
  "我最近在读一本历史书", "大概会来两百人", "小王负责写会议纪要", "我想转行是因为喜欢和用户打交道",
  "我在上家公司主要做支付系统", "最难的部分是性能优化", "索引失效通常是因为函数运算",
  "这个需求优先级很高", "我们先做 iOS", "出差没问题", "考试可以带计算器", "这里取对数是为了让乘法变加法",
  "我简单介绍一下我的教育背景", "我讲讲我遇到过最难的 bug", "价格已经是最低了", "周五我有空",
  "不管怎么说，结果还是好的", "什么时候都可以联系我", "随便问什么都行", "他们不知道该怎么办",
  "大家有问题可以随时打断我", "那我们开始吧", "好的，那就先这样", "这个我们下次再说",
  "I would do it the same way", "We handle deadlines by cutting scope", "Everyone got the slides",
  "There is a recording on the website", "My biggest weakness is impatience", "We can push it to next week",
  "That's a good question", "Let me explain how garbage collection works", "This is from chapter four",
  "No questions from my side", "So that's basically it", "Okay let's move on",
];
