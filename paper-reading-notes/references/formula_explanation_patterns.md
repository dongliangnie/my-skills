# Formula deep-explanation patterns

本文件是「公式深讲协议」(SKILL.md Step 6) 的真实范例集。目标深度：**读到它的人能不看原文把公式讲给别人**。用户会反复要求把某个公式讲得更细——一次做到这个标准，避免返工。

## General template (fill per formula)

在公式 `$F$` 下用一个 `>` 引用块，按需包含：

```
> **补：把公式 (n) <公式名>逐项拆开**
>
> **它要解决什么问题？** <动机/困惑，先讲 why 再讲形式>
> **数学来源** —— <推导：把原文/补充材料里对应式子写出来并解释每一项>
> **为什么这样设计** —— <控制变量 / 取绝对值防抵消 / 减基准等选择的意图>
> **符号对照** —— <每个变量、上下标、算子、范数；向量还是标量、维度>
> **怎么读取值** —— <=0 / =1 / >0 / <0 / 典型值 的含义>
> **边界** —— <证明了什么、没证明什么；原文没说的如实标注>
```

六项里 **符号、来源、读法、边界** 四项必做；动机与设计按需。

## Worked examples (from RelayWAM note, arXiv 2611.22994)

### Example 1 — 控制变量型差值：$\Delta R^2_l = R^2_{l,A1} - R^2_{l,A0}$

讲透要点：
- **动机**：不是问"某层有没有未来信息"，而是"**未来监督这个目标额外**写入多少"→ 做对照实验。
- **两个模型**：A1 = $\mathcal{L}_{action}+\lambda_{future}\mathcal{L}_{future}$，A0 = 仅 $\mathcal{L}_{action}$，结构/数据相同只差未来损失；相减扣掉"静态场景+本体状态本来就能猜到一部分未来"的底色（原文原话：scene context and proprioception partially constrain dynamics，故用 decodability gap isolate net contribution）。
- **目标 $\Delta z$**：$\mathrm{Pool}(z_{t+1})-\mathrm{Pool}(z_t)$ 是位移向量；为什么不用 $z_{t+1}$——否则探针靠记背景/桌子位置就能拿高分，测的是"场景记忆"而非"未来动态"。
- **读法**：≈0 = 无净贡献；越大 = 写得越多；下标 $l$ 逐层算，曲线浅小深大 = "写进深层"的证据。
- **边界**：探针只证明信息**存在**(decodable) ≠ 动作通路**使用**。

### Example 2 — 概念型操作：空间池化 $\bar{x}_l=\mathrm{Pool}(X^v_l)$

讲透要点：
- **是什么**：DiT/ViT 把图切成 N 个 patch token，第 l 层特征是序列 $X^v_l\in\mathbb{R}^{N\times d_v}$（空间×通道）；池化沿空间维把 N 个 token 压成一个向量 $\bar{x}_l=\frac1N\sum_i X^v_{l,i}\in\mathbb{R}^{d_v}$。
- **为什么**：① 线性探针要固定长度向量；② 测"整层整体"而非某个 patch；③ 位置/置换不变性。
- **两处用法分清**：目标 $\Delta z$ 的 Pool 与探针输入 $\bar{x}_l$——都池化成向量才维度对齐做回归。
- **边界/诚实**：论文正文与补充只写 "spatially pooled visual tokens / $\mathrm{Pool}(\cdot)$"，**未指定具体算子**；按 ViT/DiT 惯例理解为全局平均池化，并明确标注这一点，不把惯例当原文事实。

### Example 3 — 指标型比值：$R^2_l=1-\frac{\sum_n\|\Delta z_n-f_l(\bar{x}_{l,n})\|^2}{\sum_n\|\Delta z_n-\overline{\Delta z}\|^2}$

讲透要点：
- **符号**：n 留出集样本索引；$\Delta z_n$ 真值；$f_l(\bar{x})$ 预测；$\overline{\Delta z}$ 样本均值；$\|\cdot\|^2$ 平方范数（Δz 是向量，各维误差平方求和）。
- **分子**=残差平方和 $SS_{res}$（没解释掉）；**分母**=总平方和 $SS_{tot}$（数据总波动）。
- **为什么分母是猜均值**：常数预测 $\overline{\Delta z}$ 是最小二乘意义下不看输入的最优平凡猜测，所以 $1-SS_{res}/SS_{tot}$ = 相对猜均值把误差降低了百分之几 = "解释了多少方差"。
- **读法**：1 完美 / 0 等于没预测（最关键参照：该层线性读不出未来）/ 0~1 越大越好（0.4=解释40%方差）/ <0 学歪了。
- **细节**：向量各维合起来的全局系数（非逐维平均）；必须留出集算，否则岭回归记忆样本致虚高 → 呼应按 episode 划分的 5 折。

### Example 4 — 数据切分概念：留出集 (held-out set)

讲透要点：
- **概念**：数据切训练/测试两半，测试集不参与训练只打分；$R^2$ 只在没见过的样本上算才叫 held-out。
- **为什么**：测泛化可解码性而非记忆，防 $R^2$ 虚高。
- **本文切法**：按 episode 整条划分（100 条 LIBERO 分 5 折），不能逐帧随机切——相邻帧高度相似，混在一起是数据泄漏(leakage)。
- **两层切分**：内层 CV 选正则 α / 外层留出折算 R²，样本互不交叉。
- **更严格处**：因果擦除在完全独立的 held-out episodes 上评估。

### Example 5 — 敏感度型归因：$s^{\mathcal{L}}_l(p)=\sum_c|V^v_{l,p,c}\frac{\partial\mathcal{L}}{\partial V^v_{l,p,c}}|$

讲透要点：
- **动机**：注意力权重只说明"往哪看"，≠对目标重要；要目标相关的敏感度图，对 $\mathcal{L}_{action}$ 和 $\mathcal{L}_{future}$ 各算一张对比。
- **为何用 $V^v_l$ 而非注意力权重**：$V^v_l$ 是动作注意力实际读取的 value，在其上做敏感度才对应"动作通路依赖了什么"。
- **数学来源**（补充 Eq. B1，一阶泰勒）：屏蔽 token p 后 $\mathcal{L}(V^{v,(p)}_l)-\mathcal{L}(V^v_l)\approx-\sum_c V^v_{l,p,c}\frac{\partial\mathcal{L}}{\partial V^v_{l,p,c}}$，即"激活 × 梯度"；负号来自屏蔽改变量 $-V$。
- **为何逐通道取绝对值再求和**：带符号相加会正负抵消(cross-channel sign cancellation)低估影响；取绝对值求和得到"一阶损失扰动的紧上界"——正是"移除 token p 时 $\mathcal{L}$ 一阶变化的上界"的由来。
- **可比性**：两张图从同一次前向分别反传到同一 $V^v_l$，保证输入/网络状态一致。
- **用法**：归一化取 top-10% token 集中度 $C^{\mathcal{L}}_l$（Eq. B2，均匀基准 0.1）→ 深层动作焦点集中到夹爪/物体、未来焦点弥散背景。

## Discipline

- 每个细节回原文（正文 + **补充材料**）核对；公式推导常只在补充里。
- 原文没说的写"论文只写 X，未指定 Y，按惯例理解为 Z"，**不杜撰**。
- 补充材料公式常用 A/B/C 前缀编号（如 R² 定义 Eq. A2、归因泰勒 Eq. B1），别照搬正文编号。
- **术语按论文用词，别套通用叫法**：如 Fast-WAM/RelayWAM 主干是 MoT（Mixture-of-Transformers）**共享自注意力 + 结构化掩码**，动作读视觉叫 `action attention`，**不要写成 cross-attention**；论文里的 cross-attention 专指新增 transition space 的 readout。写之前 grep 源码确认作者怎么称呼，用户会纠正术语错误。
- **掩码/注意力要分清 token 类别，别统称「视频」**：Fast-WAM 掩码把 token 分三组——①首帧干净 latent（shared visual anchor）、②未来帧带噪 latent（仅训练视频建模）、③action。规则：action 能看①③但不能看②（防未来泄漏、训推一致）；注意力式里的 $V^v$ 是 "current-frame video tokens"=①首帧锚点。若笼统写「动作可看视频」会和「动作看不见未来视频」自相矛盾。描述前先确认是哪类 token。
- **画架构图/讲输入时，逐路核对每个条件的精确定义，别把不同输入流并成一路**：如 RelayWAM 的条件 $\mathbf{C}=[\mathbf{C}^{\mathrm{lang}};\mathbf{C}^{\mathrm{state}}]$ 只含指令（text encoder 投影）和本体状态（MLP + joint-index embedding），**不含相机图像经 VAE 得到的 latent**——后者走的是 Video DiT 的蓝色视觉通路，通过视觉 K/V 单独进入注意力。写「哪几路汇成 C」前必须 grep 源码里 $\mathbf{C}$ 的定义式确认成分，用户会纠正这类混淆。
