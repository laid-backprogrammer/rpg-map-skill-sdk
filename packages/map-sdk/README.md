# @mossbrook/map-sdk

不依赖 React、Canvas 或浏览器的 JavaScript / TypeScript 地图生成 SDK。先生成可通行骨架，再放置房屋、隔墙和家具，最后校验真实角色碰撞。内置散落村落、对称城镇、网格城镇，以及住宅、旅店、工坊室内模板。`0.3.0` 新增独立的分层美术规划接口 `createArtPlan`。

## 快速使用

从本项目目录安装到其他工程：

```sh
npm install ./packages/map-sdk
```

也可以安装本项目 `npm run sdk:pack` 生成的 `.tgz` 或 GitHub Release 的安装包。当前未发布到 npm，不能假设远程 `npm install @mossbrook/map-sdk` 已经可用。完整的克隆、安装和 Skill 使用方式见仓库根目录 README。

```js
import { createMapSDK, findPath } from "@mossbrook/map-sdk";

const sdk = createMapSDK({ seed: 1042 });

const village = sdk.generateTown();
const city = sdk.generateTown({
  layout: "symmetric",
  width: 49,
  height: 49,
  roadWidth: 3,
  buildingCount: 16,
  perimeterWalls: true,
});
const grid = sdk.generateTown({ layout: "grid", width: 49, height: 41 });

const cottage = sdk.generateInterior({ template: "cottage" });
const inn = sdk.generateInterior({
  template: "inn",
  symmetry: "quadrilateral",
  furnitureDensity: 0.8,
});
const workshop = sdk.generateInterior({
  template: "workshop",
  doors: [{ side: "south" }, { side: "north" }],
});

const house = sdk.generateBuildingInterior(city, city.buildings[0].id);
console.log(house.parent, house.connections);
console.log(city.report.passed, findPath(city, city.exits[0], city.exits[2]));
```

相同种子和参数产生相同地图。工厂默认值目前只包含 `seed`；其他参数在每次生成调用中指定。生成函数不会悄悄返回不可达地图：无效参数抛出 `TypeError` / `RangeError`，无效结果会抛出错误。

## 城镇方案

| `layout`        | 结构                             | 尺寸与约束                                                          |
| --------------- | -------------------------------- | ------------------------------------------------------------------- |
| `organic`，默认 | 散落新手村、河流和桥，五栋房屋   | 固定 `48×36`；`density` 在 `0..1`；道路宽度固定为 3                 |
| `symmetric`     | 中心广场、四向主路、成组镜像房屋 | `25..129` 的奇数尺寸；正方形保持 D4 旋转及镜像，长方形保持 X/Y 镜像 |
| `grid`          | 网格街区与中心四向主路           | `25..129`，允许偶数尺寸                                             |

所有方案均有 `north/east/south/west` 四个边界出口，并验证出口之间可达。散村的出口不要求对齐或对称。`perimeterWalls: true` 仅用于结构化城镇，城墙只有四处主路开口。

结构化道路宽度支持 `3/5/7`。显式 `buildingCount` 必须能够精确容纳；对称方案要求数量是 4 的倍数，否则报错。省略数量时按地块容量生成，不保证小地图也放下 16 栋房屋。对角线对称房屋可能有多个入口，读取 `building.doors[]`，不要只读取兼容字段 `building.door`。

对称保证的是地形、道路、碰撞占地和入口结构，不是有透视的屋顶图片。美术映射、材质和遮挡由使用 SDK 的游戏引擎处理。

## 室内方案

| `template` | 默认尺寸 | 默认功能区             |
| ---------- | -------- | ---------------------- |
| `cottage`  | `17×15`  | 四个住宅功能区         |
| `inn`      | `23×19`  | 六个客房和接待功能区   |
| `workshop` | `21×17`  | 工坊、仓储、办公功能区 |

四方对称旅店有八个功能区，四方对称工坊采用两处对称大工作区。室内模板不是通过更换名字复用同一隔墙。

- `symmetry`: `none`、`bilateral`（X 镜像）、`quadrilateral`（X/Y 镜像）。后两者要求奇数尺寸，并且显式门口配置必须满足对应镜像。
- `doors`: `{side, offset?, id?}[]`。`offset` 是边界上的整数格坐标，不是百分比；省略时位于边界中点。
- `quadrilateral` 默认自动生成四边门口；其他模式默认南门。
- `corridorWidth`: 至少 3 的奇数，尺寸不足以容纳功能区时拒绝生成。
- `furnitureDensity`: `0..1`，家具占地及交互位置必须保持可达。
- 住宅最小 `15×15`，旅店最小 `21×19`，工坊最小 `17×15`；上限 `101×101`。更宽通道可能要求更大尺寸。

`generateBuildingInterior` 使用房屋的室内模板和稳定派生种子，返回 `parent` 与 `connections` 供引擎切换场景。它不会实现传送动画、NPC 对话或保存系统。自定义室内门户必须包含每个外部门口的朝向。

## 数据与碰撞

输出是可直接 JSON 序列化的 `TownMap` / `InteriorMap`：

```text
id, schemaVersion, kind, seed, width, height
tiles[y][x], walkable[y][x], roadMask[y][x]
entities[], spawn, landmarks[], exits[]
buildings[] 或 rooms[] / doors[]
generation, report
```

`TILE`: `GRASS=0, PATH=1, WATER=2, BRIDGE=3, WALL=4, FLOOR=5`。默认水和墙不可穿越。实体 `solid` 控制碰撞；`visual` 是单独的图片范围，不是碰撞体。

寻路、出生点、地标和门户使用整数格索引 `(x,y)`；连续角色中心是 `(x+0.5,y+0.5)`。`canOccupy`、`canTraverse` 和 `findPathFromPosition` 接收连续坐标。

A*、洪水填充和连通分量都检查圆形角色沿整个边的移动，不仅检查两端。细墙或围栏位于两个自由格之间时也会阻断路径。`maximalRectangle` 返回最大可走**栅格中心矩形**，不代表整个连续区域没有细障碍物；放置实体仍需检查占地与净距。

```js
import {
  rebuildNavigation,
  validateMap,
  assertValidMap,
} from "@mossbrook/map-sdk";

// 外部编辑器、素材占地调整或第三方求解器修改 map 后：
rebuildNavigation(map);
const report = validateMap(map);
assertValidMap(map); // 失败抛 MapValidationError，附带 error.report
```

生成器预留 `roadMask`；不要让装修算法覆盖这些通道。报告包括所有门口和功能节点的路径、单一连通分量、碰撞与导航一致性、保留道路及角色净空。故意修改导航掩码但不更新碰撞会被识别为不一致。

## 分层美术规划

`createArtPlan(map, options)` 根据已有物理地图生成可 JSON 序列化的渲染计划。相同地图、种子和参数产生相同计划；它不修改 `tiles`、`entities`、`walkable`、交互点、碰撞或导航，也不调用 AI、网络、DOM 或 Canvas。

```js
import { createMapSDK, createArtPlan } from "@mossbrook/map-sdk";

const sdk = createMapSDK({ seed: 1042 });
const city = sdk.generateTown({ layout: "symmetric", width: 49, height: 49 });
const art = createArtPlan(city, { preset: "generic", tileSize: 32 });
const room = sdk.generateInterior({ template: "cottage" });
const roomArt = sdk.createArtPlan(room, { preset: "plain" });

// 引擎读取这些数据；SDK 本身不绘制贴图，也不加载 sprite 图片。
console.log(art.fields.moisture, art.groundDecals, art.contactShadows);
console.log(roomArt.statistics.collisionChanges); // 0
```

| 参数 | 默认值 | 含义 |
| --- | --- | --- |
| `seed` | `map.seed`，缺省再使用 `1042` | 字符串或有限数字；控制材质场变化和采样 |
| `tileSize` | `32` | 正的有限像素尺寸；计划中的坐标仍是地图格单位 |
| `preset` | `"fangcun"` | `"fangcun"`、`"generic"` 或 `"plain"` |

工厂上的 `sdk.createArtPlan` 与独立函数相同；它读取地图的种子，不把工厂默认种子覆盖到外部地图上。改变种子只改变渲染计划，不会重生成物理地图。

### 输出约定

所有网格均为 `height × width`，使用 `[y][x]`。所有矩形、装饰坐标、分组半径及 `visual` 偏移均以地图格为单位；只有 `tileSize` 是像素尺寸。

| 字段 | 数据与用途 |
| --- | --- |
| `version`, `seed`, `preset`, `width`, `height`, `tileSize` | 计划元信息；计划版本目前为 `"1.0"`，不是 SDK 版本 |
| `materials` | `map.tiles` 的独立副本，材质编号沿用 `TILE` |
| `transitions` | 同材质邻接的 8 位掩码，供自动拼接或边界着色使用 |
| `fields` | 道路、水体、墙体距离以及阴影、通行热度、湿润度启发式场 |
| `protected` | 美术摆放保护区；不是新的碰撞或可行走掩码 |
| `semanticZones` | 从现有地形分区和建筑推导的药圃、庭院、建筑地块、池岸等矩形语义区 |
| `groups` | 语义组，含 `id/kind/zone/anchor/radius/memberIds`，可带 `parentId` |
| `groundDecals` | 地面细节矩形：`id/kind/x/y/width/height/alpha/parentId?` |
| `contactShadows` | 软接触阴影矩形，`kind: "soft"`，`parentId` 指向所属实体 |
| `decorations` | 渲染专用实体，均为 `solid: false`，包含图片范围、分层、透明度和所属组 |
| `statistics` | 各项数量、保护格数、采样器及过渡规则；`collisionChanges` 恒为 `0` |

`transitions` 的位序为 `N, NE, E, SE, S, SW, W, NW`，分别对应 `1, 2, 4, 8, 16, 32, 64, 128`。只有同材质邻居才设位，地图外视为不匹配；对角位还要求相邻两个正交位同时存在。例如 `NE` 必须同时有 `N` 与 `E`。这是 47 型 Blob 邻接规则的掩码，**不是已完成的 47 张过渡贴图图集**；调用方仍需提供匹配素材、索引映射或边界绘制器。

`roadDistance/waterDistance/wallDistance` 为多源 BFS 的曼哈顿格距离；没有对应材质时使用有限值 `width + height`。`shade/traffic/moisture` 均在 `0..1`，只是可用于混合贴图的启发式数据，不是物理光照或水文模拟。通行热度从出生点到现有交互点、地标和门户的路线推导。

保护区包括道路掩码与路面附近、真实交互路线两侧一格，以及出生点、交互接近点和门前的 `3×3` 范围。装饰不能改变通路；`protected` 不会覆盖或取代游戏已有导航判断。

贴花 `kind` 包括 `foundation-dirt`、`moss`、`wear`、`crack`、`root-soil`、`leaf-litter`、`shore-wet`。矩形为地面绘制范围，`alpha` 在 `0..1`；不提供贴花图片。建筑组也可以仅通过带 `parentId` 的地面细节表达关系，而没有新增实体成员。

装饰包含 `sprite/groupId/layer/foreground/opacity/visual`；`layer` 可为 `background/ground/entity/foreground`。`x/y/width/height` 是根部范围，`visual` 是独立图片范围，允许树冠重叠，不能拿图片包围盒当碰撞体。建议由引擎按根部脚点排序，并对人物被屋檐或树冠遮挡的情况做透明化。

### 预设范围

所有预设都会生成基础网格场、过渡掩码、保护区和适用的建筑、树根地面细节与接触阴影。当前 `generic` 和 `plain` 都不额外生成方寸山式大型配景；`plain` 也不是“关闭全部细节”的开关。

`fangcun` 的成簇林缘和池塘配景**仅在输入地图的 `sceneId === "courtyard"` 时启用**，针对本项目经过验证的方寸山庭院布局。它不代表任意城镇自动拥有同样完整的园林构图，也不把室内或识海套用成森林。该阶段用 `poisson-disk-sampling` 先采样簇锚点，再用局部可变间距采样成员；有限预算按簇分配，避免整片均匀散点或沿边整齐排队。

这一预设使用 `pine_canopy/bamboo_canopy/cliff/herb_bed/lotus` 等已有 sprite 键。新增林缘根部完整占地只位于现有 `WALL`，荷叶只位于现有 `WATER`，且不进入保护区。SDK 不提供这些图片；使用其他素材库时应由引擎映射键名。现有剧情实体及互动状态仍由游戏管理，渲染计划不是剧情地图的替代品。

推荐引擎绘制顺序：地表底图、地面贴花与接触阴影、按脚点排序的实体、独立前景、特效。AI 底图的生成与审图留在外部制作流程中，不能让生成图中新增的视觉障碍偷偷改变物理地图。

## WFC 的位置

这一版采用模板与受约束布置，没有冒充 WFC。普通 WFC 主要约束局部模式与邻接关系；全局连通必须另加约束或校验。[WFC 官方实现](https://github.com/mxgmn/WaveFunctionCollapse)、[带连通约束的 DeBroglie](https://boristhebrave.github.io/DeBroglie/articles/path_constraints.html)。

后续接入建议：固定出口与主路，求解房间内部的局部墙面、地板或家具组合，然后调用同一验证器；失败时有限重试或返回明确错误。对称编辑也必须按镜像组执行。SDK 已暴露地图数据、导航重建和强校验，不绑定某个 WFC 库。

## 项目内命令

```sh
npm run generate -- --layout symmetric --width 49 --height 49 --walls --out output/city.json --art-out output/city-art.json
npm run generate -- --kind interior --template inn --symmetry quadrilateral --out output/inn.json
npm run examples
npm run sdk:pack
npm test
npm run check:types
```

本地示例会生成三种城镇及三种室内空间。SDK 核心不调用 AI；AI 图片只用于外部美术映射，因此生成地图不需要网络、API key 或 React。
