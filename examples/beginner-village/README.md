# 新手村：井边来信

这是一张可以查看的序章村子，不是新的地图生成器。物理布局就是现有的 `organic` 城镇，种子 `1042`：48×36、五栋房子、四个出口、村长、告示牌、水井和旅店。树、水井和旅店的高度写在美术计划的 `spriteStacks` 里。碰撞、寻路、门口净空和可行走格保持原样。

在检查器里选择 **Beginner village**，或运行 `npm run examples`，查看 `output/sdk-examples/beginner-village.json`、`beginner-village-art.json` 和 `beginner-village-story.json`。

`npm run demo` 会同时打开俯视检查器和 HD-2D 场景。页眉的 **HD-2D scene**，或地址栏的 `/scene.html`，进入可环绕的序章村子：暖色光、接触阴影、轻微辉光。树、水井和旅店用抠好的水平切片叠在真实占地上；其他房屋复用旅店切片。**Footprints** 默认关闭。**Story** 可以打开这篇序章。碰撞和寻路数据没有改。检查器里的 **Sprite stacks** 仍是占位色块，用来对照合同，不是这张场景。

## 故事

你沿南边的土路走进村子，停在通向广场的路口。前面是水井，东北方向是客栈的屋顶。屋顶和水井看起来更高，路还是原来那条。

路边的告示牌上钉着一张没署名的纸条：桥边柳树下丢了一只铜铃，拾到的人请交给村长。这是序章里的一件小事，不是结局。

村长等在老宅门口。她只要你先把村子走通：告示、她家的门，还有水井。她不会为了画面好看去挪房子，也不会把树冠算进挡路的墙。

准备好以后，沿主路走到北出口。那是离开序章的第一段路。东边的桥和其他出口仍然开着。叠起来的树留着和以前一样的空隙。

## Story

You come in on the south road and stop where the path opens toward the square. The well is ahead. The wayfarer lodge's roof is the tall shape to the north-east. The height is only drawn; the road is the one already on the map.

A board by the lane carries one unsigned note: a copper bell was lost under the willows by the bridge. Bring it to the elder if you find it. It is a small errand, not the end of the story.

The elder waits by the cottage door. She asks you to walk the village first: the board, her door, and the well. She does not move the houses, and a canopy is not a wall.

When you are ready, take the main road to the north exit. That is the first way out of the prologue. The other gates stay open, and the stacked trees leave the same gaps as before.

## 哪些道具叠了层

| 道具 | 地图实体 | 堆叠 | 仍然是单张图 |
| --- | --- | --- | --- |
| 西边的三棵树 | `tree-*` | 7 层，等距 `0.36`，世界高度 `2.16` | 其余的树、石头、花 |
| 水井，当作村中石碑 | `village-well` | 5 层不等距石阶，顶高 `1.35` | 告示牌、路牌、村长 |
| 旅店 | `guest-lodge` | 地基、墙、屋檐、屋顶四层，等距 `0.55` | 其他房屋 |

每一层都引用原来的二维占地。`collision` 是 `footprint-only`，排序用世界脚点的 `y`。SDK 不画这些切片，也不提供图片。
