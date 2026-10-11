---
title: "黄金分割、连分数与兔子"
date: 2026-09-08
description: "从兔子繁殖问题出发，用连分数重新认识黄金分割，并解释为什么它是最难被有理数逼近的数。"
tags: ["数论", "连分数"]
math: true
toc: true
---

## 从一对兔子说起

Fibonacci 在《计算之书》里提出的问题大概是最著名的数学趣题之一：一对兔子每月生一对新兔，新兔满两个月后开始生育，问 $n$ 个月后共有多少对兔子。设 $F_n$ 为第 $n$ 个月的兔子对数，则

$$
F_1 = F_2 = 1,\qquad F_{n+2} = F_{n+1} + F_n .
$$

前几项是 $1,1,2,3,5,8,13,21,\dots$。真正有意思的问题不是"第 $n$ 项是多少"，而是**相邻两项之比会趋于什么**。

## 比值的极限

设

$$
x = \lim_{n\to\infty} \frac{F_{n+1}}{F_n}
$$

（先假定极限存在，后面再补上这个漏洞）。把递推式两边同除以 $F_{n+1}$：

$$
\frac{F_{n+2}}{F_{n+1}} = 1 + \cfrac{F_n}{F_{n+1}} = 1 + \cfrac{1}{\dfrac{F_{n+1}}{F_n}} .
$$

令 $n \to \infty$，得到

$$
x = 1 + \frac{1}{x} \quad\Longrightarrow\quad x^2 - x - 1 = 0 .
$$

正根即黄金分割比

$$
\varphi = \frac{1+\sqrt{5}}{2} \approx 1.6180339887\ldots
$$

## 连分数视角

上面的推导其实已经暴露了一件事：$\varphi$ 满足的方程 $x = 1 + 1/x$，正是**连分数**的定义式。把它无限展开：

$$
\varphi = 1 + \cfrac{1}{1 + \cfrac{1}{1 + \cfrac{1}{1 + \cdots}}}
= [1;\, \overline{1}] .
$$

也就是说，$\varphi$ 的连分数展开是"全是 1"的最简单形态。

{{< theorem title="为什么这让 φ 最难被逼近" number="1" >}}
对任意无理数 $\alpha$，其连分数展开的部分商越大，有理逼近就越"好"。形式化地说，若 $\alpha = [a_0; a_1, a_2, \dots]$，则渐近分数 $p_k/q_k$ 满足

$$
\left| \alpha - \frac{p_k}{q_k} \right| < \frac{1}{a_{k+1} q_k^2}.
$$

$\varphi$ 的所有部分商都等于 1，是所有无理数中最小的可能取值，因此它的逼近误差上界最"紧"，也最难被有理数逼近。
{{< /theorem >}}

{{< proof >}}
设 $\alpha = [a_0; a_1, a_2, \dots]$，其渐近分数依次为 $p_k/q_k$。由连分数的基本恒等式

$$
\alpha - \frac{p_k}{q_k} = \frac{(-1)^k}{q_k\left(q_{k+1} + \dfrac{q_k}{\alpha_{k+2}}\right)} ,
$$

其中 $\alpha_{k+2} = [a_{k+2}; a_{k+3}, \dots] > a_{k+2}$。于是

$$
\left| \alpha - \frac{p_k}{q_k} \right| < \frac{1}{q_k \cdot a_{k+1} q_k} = \frac{1}{a_{k+1} q_k^{2}} .
$$

对 $\varphi$ 而言所有 $a_{k+1} = 1$，代入即得结论。
{{< /proof >}}

## 一个可以自己验证的小实验

用 $F_{n+1}/F_n$ 逼近 $\varphi$，看看误差：

| $n$ | $F_{n+1}/F_n$ | 与 $\varphi$ 的差 |
| --- | --- | --- |
| 5 | $8/5 = 1.6$ | $\approx 1.8\times 10^{-2}$ |
| 8 | $34/21 \approx 1.61905$ | $\approx 1.0\times 10^{-3}$ |
| 12 | $233/144 \approx 1.618056$ | $\approx 2.2\times 10^{-5}$ |
| 16 | $1597/987 \approx 1.618034$ | $\approx 4.6\times 10^{-7}$ |

误差大约每两步缩小到原来的 $1/10$——这正是 $1/q_k^2$ 尺度的表现。

{{< note type="idea" title="顺带一提" >}}
把上表的误差乘以 $q_k^2$（即 $F_n^2$），你会发现它总在 $1/\sqrt{5}$ 附近摆动。这其实就是 Binet 公式的另一种写法：

$$F_n = \frac{\varphi^n - \psi^n}{\sqrt{5}},\qquad \psi = \frac{1-\sqrt{5}}{2}.$$
{{< /note >}}

## 遗留的问题

前面假定极限存在，这一步并不显然。一个干净的补法是先证明 $|x_{n+1} - \varphi| < |x_n - \varphi| / \varphi$，即每次迭代都按固定比例缩短距离，从而由压缩映射原理得到收敛。

这个证明我下次单独写一篇。
