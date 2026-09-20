---
title: "一道定积分的三种解法"
date: 2026-07-15
description: "计算 ∫₀^{π/2} ln(sin x) dx：用对称性、用级数、用参数求导，三条路都能走通，收获却不一样。"
tags: ["微积分", "解题"]
math: true
toc: true
---

## 题目

求

$$
I = \int_{0}^{\pi/2} \ln(\sin x)\,\mathrm{d}x .
$$

这是个经典题，答案出人意料地干净。下面用三种方法各做一遍，顺便比较它们各自的"代价"。

## 方法一：对称性

注意到 $\sin x$ 在 $[0, \pi/2]$ 上关于 $x = \pi/4$ 对称，于是 $\sin(\pi/2 - x) = \cos x$，可以做换元：

$$
I = \int_0^{\pi/2} \ln(\cos x)\,\mathrm{d}x .
$$

两式相加：

$$
2I = \int_0^{\pi/2} \ln(\sin x \cos x)\,\mathrm{d}x
= \int_0^{\pi/2} \ln\!\left(\frac{\sin 2x}{2}\right)\mathrm{d}x .
$$

拆开对数，前一项做 $u = 2x$：

$$
\int_0^{\pi/2} \ln(\sin 2x)\,\mathrm{d}x = \frac{1}{2}\int_0^{\pi} \ln(\sin u)\,\mathrm{d}u = \frac{1}{2}\cdot 2I = I .
$$

（最后一步再次用到对称性：$[0,\pi]$ 上的积分是 $[0,\pi/2]$ 上的两倍。）

第二项是常数：$\displaystyle\int_0^{\pi/2} \ln 2 \,\mathrm{d}x = \frac{\pi}{2}\ln 2$。所以

$$
2I = I - \frac{\pi}{2}\ln 2
\quad\Longrightarrow\quad
\boxed{\,I = -\frac{\pi}{2}\ln 2\,}
$$

**代价**：最短，但要求你先"看"到对称性。

## 方法二：级数展开

从 $\ln(\sin x) = \ln 2 + \ln(\sin x / 2)$ 出发不方便，改用 $\sin x = 2\sin(x/2)\cos(x/2)$ 反复对半，或直接用已知展开

$$
\ln(2\sin x) = -\sum_{n=1}^{\infty} \frac{\cos 2nx}{n} .
$$

于是

$$
I = \int_0^{\pi/2}\ln(2\sin x)\,\mathrm{d}x - \frac{\pi}{2}\ln 2
= -\sum_{n=1}^{\infty}\frac{1}{n}\int_0^{\pi/2}\cos 2nx \,\mathrm{d}x - \frac{\pi}{2}\ln 2 .
$$

而 $\displaystyle\int_0^{\pi/2}\cos 2nx\,\mathrm{d}x = \frac{\sin n\pi}{2n} = 0$，求和项整体为零，于是同样得到 $I = -\dfrac{\pi}{2}\ln 2$。

**代价**：需要交换求和与积分（这里由一致收敛保证），但几乎不需要灵感。

## 方法三：引入参数

定义

$$
F(\alpha) = \int_0^{\pi/2} \sin^{\alpha} x \,\mathrm{d}x,\qquad \alpha > -1 .
$$

我们要求的是 $F'(0)$。由 Beta 函数

$$
F(\alpha) = \frac{\sqrt{\pi}\,\Gamma\!\left(\frac{\alpha+1}{2}\right)}{2\,\Gamma\!\left(\frac{\alpha+2}{2}\right)} .
$$

两边对 $\alpha$ 求导并取 $\alpha = 0$，利用 $\Gamma(1/2) = \sqrt{\pi}$、$\Gamma(1) = 1$ 以及 $\psi(1) = -\gamma$：

$$
F'(0) = \frac{\sqrt{\pi}}{2}\left[\frac{1}{2}\psi\!\left(\tfrac12\right) - \frac{1}{2}\psi(1)\right]
= \frac{\sqrt{\pi}}{2}\cdot\frac{1}{2}\left(-\gamma - 2\ln 2 + \gamma\right)
= -\frac{\pi}{2}\ln 2 .
$$

（用到了 $\psi(1/2) = -\gamma - 2\ln 2$。）

**代价**：最"重"，但方法最普适——换成 $\sin^{\alpha}$ 的任意阶矩都能一并算出来。

{{< note type="tip" title="三种方法怎么选" >}}
- 只想要答案：方法一。
- 想要可复现的机械流程：方法二。
- 想要一个能推广的工具：方法三。

同一道题走三条路，最大的收获往往不是答案，而是知道**每条路各自的边界在哪里**。
{{< /note >}}
