# 素材与动画合同

本文件描述**引擎适配层建议采用的素材合同**，不是 SDK 导出的 `ArtPlan` 类型，也不是已经实现的素材校验器。下面路径与图集均为示例；公开包不包含这些图片。实现时可换字段名，但不能混淆物理格、连续位置、像素锚点和碰撞体。

## 四种几何信息

| 信息 | 单位与来源 | 用途 |
| --- | --- | --- |
| 物理占地 | 地图格单位，来自地图实体 | 碰撞、导航、门前净空 |
| 连续世界脚点 | 地图格单位，由角色/实体确定 | 放置、深度排序 |
| 图片锚点 | 未裁切画布的像素坐标 | 防止图片或帧漂移 |
| 图片/遮挡范围 | 图片像素或明确换算的地图单位 | 显示、屋檐/树冠遮挡，不自动参与碰撞 |
| 水平切片堆叠 | 地图格单位的层数、间距、枢轴和世界高度，并引用已有占地 | 把若干水平切片错开，形成伪三维；不参与碰撞 |

地图格 `(x,y)` 的中心是 `(x+0.5,y+0.5)`。SDK 的 `visual.offsetX/offsetY/width/height` 使用地图单位；下面 manifest 的 `anchorPx` 使用像素。SDK `Entity.anchor` 不应直接接收 `anchorPx`。

在缩放统一的前提下：

```text
footPx = worldFootUnits * tileSize
imageOriginPx = footPx - anchorPx * drawScale
imageSizePx = canvasPx * drawScale
sortDepth = worldFootUnits.y
```

相机变换在这之后统一应用。裁切图像时必须保存裁切偏移；更简单可靠的方式是保留每帧同样大小的透明画布。不要每帧按 alpha 边界重新计算脚点。

## 场景素材 Manifest 示例

```json
{
  "schemaVersion": "example.asset-contract.1",
  "mapRef": "city-1042",
  "layoutRevision": "layout-v1",
  "tileSizePx": 32,
  "projection": "top-down-oblique",
  "style": { "filter": "nearest", "lighting": "upper-left" },
  "assets": [
    {
      "id": "ground-city",
      "role": "ground",
      "file": "assets/ground-city.png",
      "canvasPx": [1568, 1568],
      "alpha": "opaque",
      "worldOriginUnits": [0, 0],
      "worldSizeUnits": [49, 49],
      "constraints": {
        "materialMaskRef": "maps/city-materials.json",
        "protectedMaskRef": "maps/city-protected.json",
        "noNewObstacles": true,
        "noBakedTallEntities": true,
        "noBakedUI": true
      },
      "provenance": { "kind": "project-owned", "license": "REVIEW_REQUIRED" }
    },
    {
      "id": "oak-tree",
      "role": "entity",
      "file": "assets/oak-tree.png",
      "canvasPx": [96, 160],
      "alpha": "straight",
      "anchorPx": [48, 148],
      "drawScale": 1,
      "footprintRef": "tree-01",
      "sortMode": "world-foot-y",
      "occluder": {
        "part": "canopy",
        "maskFile": "assets/oak-canopy-mask.png",
        "policy": "relative-foot-depth",
        "actorBehindOpacity": 0.45
      },
      "provenance": { "kind": "generated", "license": "REVIEW_REQUIRED" }
    }
  ]
}
```

`footprintRef` 指向现有地图实体，不表示允许图片自行生成新碰撞。透明度策略由引擎实现；上面的 `0.45` 是可调的表现参数，不是 SDK 自动执行的功能。前景拆分或遮罩需要实际资源，不能仅填一个文件名就宣布遮挡完成。

## 水平切片堆叠

树、塔、石、碑、屋檐和类似高物可以画成一叠水平切片，让斜俯视角看起来有体积。这是可选的绘制描述。没有堆叠数据的实体仍是一张精灵图。切片的世界高度、树冠和屋檐都不是碰撞体。

SDK 的 `createArtPlan` 把同样的信息写进 `spriteStacks`。计划版本仍是 `1.0`；这个数组总是存在，没有堆叠时为空。它不修改 `tiles`、实体占地、`walkable` 或寻路，`statistics.collisionChanges` 仍是 `0`。

调用方用下面任一方式声明，不能对同一个实体声明两次：

- `createArtPlan(map, { spriteStacks: [...] })`，每项带已有实体的 `footprintId`
- 实体上的 `spriteStack`。碰撞代码不读这个字段。省略时该实体保持单图

`sliceCount` 含地面层，是 `2` 到 `64` 的整数。间距可以是统一的 `spacing`，也可以在 `slices` 里逐层给出；只给 `height` 时按层数均分。`height` 是脚平面到顶层的地图格高度，必须等于顶层标高。`pivot` 是占地矩形内的归一化点，`(0.5, 1)` 表示南侧中心脚点；省略时沿用实体上落在 `0..1` 内的 `anchor`，否则用 `(0.5, 1)`。

输出的每一项复制二维占地，并给出世界脚点。整个叠层共用 `sortMode: "world-foot-y"`，`sortDepth` 就是脚点的 `y`。引擎不要按每一层的高度改排序，也不要把层高写回 `entity.height`。`collision` 固定为 `"footprint-only"`。

```json
{
  "id": "pine-stack",
  "role": "entity",
  "file": "assets/pine-slices.png",
  "canvasPx": [64, 64],
  "sliceCount": 6,
  "alpha": "straight",
  "anchorPx": [32, 56],
  "drawScale": 1,
  "footprintRef": "tree-01",
  "sortMode": "world-foot-y",
  "spriteStack": {
    "sliceCount": 6,
    "spacing": 0.34,
    "height": 1.7,
    "pivot": [0.5, 1],
    "collision": "footprint-only"
  },
  "provenance": { "kind": "generated", "license": "REVIEW_REQUIRED" }
}
```

这里的 `spacing` 和 `height` 是地图格，`pivot` 是占地内的归一化坐标，`anchorPx` 仍是每一层未裁切画布上的像素锚点。层与层可以共用一张切片图，也可以逐层换 `sprite`。引擎若要在屏幕上把层错开，用自己的投影把 `elevation` 换成像素；SDK 不计算这个偏移，也不做遮挡。

水井、石碑这类不等距层可以写成 `slices: [{}, { "spacing": 0.42 }, { "spacing": 0.38 }]`。地面层的间距必须是 `0` 或省略。公告牌、角色和本就不需要高度的道具不要填堆叠。

可运行的例子是 [新手村](../examples/beginner-village/README.md)：它复用 `organic` 布局，只给三棵树、水井和旅店写了堆叠。告示牌、村长和路牌仍是单图。北出口的路和门口净空与堆叠之前相同。

大建筑可拆为基础/墙体、屋檐前景和门口交互三部分。树可拆根部实体与树冠遮罩。接触阴影和树根土迹由地面层绘制，不必和树冠绑定在一张大矩形图中。独立素材必须采用同一视角、光照和像素密度，不能让写实大树与小比例人物仅靠缩放凑在一起。

## 底图生成与验收

输入尽量包括 blockout 图、地形材质遮罩、固定道路/门口/保护区，以及既有风格参考。支持图像编辑的工具优先使用参考和遮罩；纯文本工具也可尝试，但结果必须重新审图，不能宣称“提示词锁定了几何”。

可用的任务描述：

```text
为已确认的 49x49 地图生成地面材质底图，画布 1568x1568。
保持参考图的道路、草地和水岸位置；只在各材质区域内变化纹理。
不得增加建筑、树干、大石、墙、门、台阶、深水或任何新的视觉障碍。
不得绘制人物、物件、文字和 UI；高大物体与交互对象另行制作。
固定斜俯视角、统一像素密度与左上光照。
```

这不是某个 provider 的 API。Skill 不读取或传播密钥，不替用户绑定服务；没有图像工具时输出明确素材任务和可运行的程序底图。

验收时将原 blockout 半透明叠在候选底图上，逐项检查路、门、桥、水岸和交互接近点。检查没有新增视觉障碍或假入口，地面没有永久烘焙角色/树冠阴影，切块之间没有断路或纹理接缝。失败只重做对应素材，物理布局保持不变；若要改布局必须显式更新版本并重新验证。

## 四方向行走图集示例

每方向 8 帧，单帧 `64x64`，同一脚点 `[32,58]`，四行分别 down/left/right/up。以下图集是合同示例，SDK 不生成它，也不提供图像拆帧服务。

```json
{
  "schemaVersion": "example.animation-contract.1",
  "actorId": "hero",
  "atlasFile": "assets/hero-walk.png",
  "atlasSizePx": [512, 256],
  "frameSizePx": [64, 64],
  "anchorPx": [32, 58],
  "alpha": "straight",
  "filter": "nearest",
  "collision": { "source": "physical-map", "radiusUnits": 0.28 },
  "walk": {
    "framesPerDirection": 8,
    "referenceFps": 10,
    "referenceStrideUnitsPerCycle": 1.2,
    "loop": true,
    "directions": {
      "down":  { "row": 0, "columns": [0,1,2,3,4,5,6,7] },
      "left":  { "row": 1, "columns": [0,1,2,3,4,5,6,7] },
      "right": { "row": 2, "columns": [0,1,2,3,4,5,6,7] },
      "up":    { "row": 3, "columns": [0,1,2,3,4,5,6,7] }
    },
    "phaseNames": [
      "left-contact", "left-down", "left-passing", "left-up",
      "right-contact", "right-down", "right-passing", "right-up"
    ],
    "contactFrames": { "leftFoot": 0, "rightFoot": 4 }
  },
  "provenance": { "kind": "generated", "license": "REVIEW_REQUIRED" }
}
```

第 `i` 列、第 `r` 行的 frame rectangle 是 `[i*64,r*64,64,64]`，不得超出图集。方向动画共用相位定义，人物转向时可以保持归一化步态相位，避免每次重新从左脚接触开始。

一个周期位移 `1.2` 格、8 帧、10 fps 对应参考速度 `1.5` 格/秒。这个数必须按素材真实步幅校准；引擎可按 `fps = speedUnitsPerSecond * framesPerCycle / strideUnitsPerCycle` 调整，或直接用移动距离驱动周期。不能只提高脚动画速度但保持角色位移不变，造成滑步。

## 为什么侧面容易像在飘

左右行走没有脚交替，通常不是帧数不足，而是四种问题之一：两脚重叠到同一轮廓、支持脚没有稳定接地、袍摆像刚性贴纸一起平移、或动画循环与移动速度不匹配。

在 8 帧中明确左脚接触与右脚接触相差半个周期。支撑阶段的脚在世界空间应接近固定，另一脚从后方前摆；手臂与腿反相。身体轻微起伏，衣袍相对骨盆有延迟，腰部、下摆和袖口不应共用一个硬矩形变形。长袍也需用脚尖、鞋跟、脚踝或下摆开合表达相位。

侧面左右方向可以镜像，但前提是服装、武器和惯用手允许；有单肩护甲、单侧剑鞘、文字纹样时不能静默翻转。新增八方向时必须补完对应帧和合同，而不是复用同一正面动作代替。

## 动画验收清单

1. 实际帧数、方向数和图集 bounds 与合同一致，无重复空帧、缺帧、错行。
2. 画布、脚点、人物比例、服装、光照、脸、手持物和身体结构一致，无多肢或姿势漂移。
3. 左右脚接触相差半个周期，手臂反相，衣袍非刚性；侧面能辨认交替。
4. 每帧 anchor 固定，裁切偏移完整；帧边缘无截断和 alpha 白边。
5. 首尾循环、停走、转向和低速播放自然，动画速度与位移相符。
6. 显示脚点和碰撞圆，在狭窄通道、门口、树前树后实测。

变身、多臂、巨大武器挥击等独立技能序列还需要蓄力/命中/恢复相位、事件帧和独立特效。图片中的大武器轮廓不是伤害体，视觉变大也不应自动放大角色移动碰撞；由玩法明确这两者。

## 来源与发布

源代码 MIT 不意味着录音、字体、音效、截图或生成素材全部可以重新分发。每个实际素材记录来源、许可、生成工具的适用条款和授权状态，发布前排除 `REVIEW_REQUIRED`。没有权限的素材用占位图或用户自行提供的资源替代，不把用户私有文件复制进公共仓库。
