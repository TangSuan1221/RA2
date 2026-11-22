import {batch} from './forms.mjs';
// Rows inherit the most recent room and host. Dimensions are metres, W H D.
let group,host;
const catalog = `
#建筑装修 floor
slab tile 3 .15 3 bay-floor 车厅混凝土地坪
slab gray 2 .02 2 anti-slip 防滑涂层
slab tile 1 .03 1 wet-tile 湿区砖
slab blue 2 .014 2 vinyl 生活区弹性地板
slab rubber 1.2 .02 .8 entry-mat 吸水地垫
slab amber .10 .004 3 parking-line 车位线
slab green .8 .004 2 walk-band 步行带
slab iron .025 .01 2 expansion 伸缩缝
slab gray .7 .012 .47 floor-patch 修补块
grid iron .24 .065 1 drain-trench 沟盖
grid steel .16 .026 .16 floor-drain 地漏
trim steel .9 .02 .13 threshold 门槛压条
slab gray 1.2 .168 .28 step 台阶
trim amber 1.2 .025 .05 nosing 防滑踏鼻
trim steel 1.2 .06 .055 platform-trim 平台收口
#建筑装修 wall
slab brick 2.4 3 .2 blockwall 砌块墙
slab white 2.4 3 .13 plasterwall 抹灰隔墙
slab tile 1.2 2.4 .03 tilewall 湿区墙
slab gray 2 .3 .22 wall-base 混凝土基座
trim rubber 2 .12 .025 cove 上翻墙脚
trim rubber 2 .085 .015 baseboard 踢脚
trim steel .09 1.2 .09 corner 护角
panel gray 1.2 .42 .035 bumper-panel 防撞护板
trim steel 2 .045 .045 coping 压条
trim white .18 2.1 .16 reveal 洞侧壁
panel iron .32 .28 .09 column-shoe 柱脚
panel gray .6 .6 .04 access 检修口
frame iron .98 2.15 .16 jamb 门框
door olive .90 2.1 .055 steel-door 钢门
door oak .90 2.1 .048 wood-door 实芯门
glass glass 1.4 .94 .16 observation 固定观察窗
glass glass .26 .45 .055 door-light 门扇观察窗
trim oak 1.4 .045 .21 sill 窗台
grid iron .6 .4 .07 louver 百叶
slab blue 1.2 1.6 .04 curtain 遮光帘
pipe iron 1.4 .025 .025 curtain-track 帘轨
panel steel .085 .12 .026 hinge 合页
duct iron .25 .065 .055 closer 闭门器
hook steel .13 .05 .065 lever 门执手
pipe steel .64 .05 .05 panic-bar 推杆
panel steel .78 .23 .009 kickplate 踢板
trim rubber .88 .024 .024 seal 密封条
tube rubber .045 .07 .045 stop 门挡
#建筑装修 ceiling
slab gray 2  .12 2 roof-deck 工业顶板
duct iron 3 .25 .13 beam 钢梁
duct iron 2.4 .12 .07 purlin 檩条
panel iron .3 .3 .065 gusset 节点板
tube steel .018 .65 .018 hanger 吊杆
trim steel 1.2 .04 .04 tee 龙骨
slab white .6 .02 .6 ceiling-tile 吊顶板
slab white 1.2 .025 1.2 wet-ceiling 湿区平顶
ring iron .022 .047 .014 lamp-link 灯链环
ring steel .16 .16 .035 clamp 管箍
pipe gray .24 .13 .13 sleeve 穿墙套管
duct steel 1.2 .42 .62 air-duct 风管
#机电 wall
cab iron .6 .84 .22 breaker 配电箱
pipe steel 1.5 .023 .023 conduit 明装线管
panel iron .12 .12 .06 junction 接线盒
panel white .073 .115 .014 outlet 插座
panel white .073 .115 .022 switch 开关
grid iron 1.2 .08 .24 cable-tray 桥架
grid white .6 .24 .065 air-grille 回风格栅
disk iron .36 .36 .12 extractor 排风扇
panel white .12 .09 .033 thermostat 温控器
pipe steel 1 .035 .035 supply 给水管
pipe gray 1 .08 .08 waste 排水管
ring red .18 .18 .045 valve-wheel 阀轮
disk gray .10 .10 .025 cleanout 清扫口
sign paper .09 .055 .002 service-tag 检修签
tube white .55 1.25 .55 heater 热水器
#照明报警 ceiling
lamp white .6 .25 .6 highbay 高棚灯
lamp white 1.2 .08 .11 strip 条灯
lamp white .6 .06 .6 troffer 平板灯
disk white .12 .12 .048 detector 烟感
tube brass .04 .075 .04 sprinkler 喷淋头
#照明报警 wall
lamp white .28 .10 .14 worklight 工位灯
lamp cloth .15 .16 .15 reading-light 床头灯
sign green .35 .18 .055 exit 出口灯牌
panel red .12 .18 .07 strobe 声光器
panel red .10 .14 .065 alarm-pull 报警盒
grid white .19 .20 .065 speaker 扬声器
air red .16 .59 .16 extinguisher 灭火器
hook iron .10 .24 .10 extinguisher-bracket 灭火器挂架
sign blue .18 .10 .015 room-id 房号
sign blue .16 .20 .015 restroom-sign 卫生间牌
sign amber .35 .24 .015 zone-sign 污洁分区牌
sign green .48 .13 .015 wayfinding 方向牌
#车厅 floor
tube amber .16 1.05 .16 bollard 防撞柱
trim rubber 1.8 .11 .08 guard-strip 墙面防撞条
sign white .55 .28 .008 bay-number 泊位号
slab amber .10 .005 1 align-line 对齐线
slab rubber .23 .15 .26 chock 轮挡
tool cloth .34 1.38 .085 wash-brush 洗车刷
tool rubber .50 1.45 .05 squeegee 刮水器
#车厅 ceiling
duct iron 2 .10 .12 exhaust-track 抽排滑轨
reel rubber .40 .56 .56 power-reel 电源卷盘
reel blue .30 .44 .44 air-reel 压空卷盘
#车厅 wall
reel rubber .39 .65 .65 wash-reel 洗车水管盘
hook brass .10 .14 .15 bib 水嘴
#装备间 floor
shelf iron .60 1.90 .57 turnout-locker 出勤柜
table oak 1.65 .45 .40 locker-bench 更衣凳
boots rubber .35 .42 .32 boots 出勤靴
bag black .29 .36 .14 mask-bag 面罩袋
gear cloth .67 .85 .27 coat 防护上衣
folded cloth .41 .20 .36 trousers 折叠防护裤
helmet amber .32 .26 .38 helmet 消防头盔
bag cloth .24 .27 .16 hood 头罩
folded cloth .12 .065 .26 gloves 消防手套
light black .055 .17 .055 torch 手电
#装备间 wall
sign paper .23 .06 .004 name-strip 姓名条
sign white .09 .09 .006 locker-number 号码牌
hook steel .22 .18 .24 helmet-rest 头盔托
hook steel .045 .11 .07 coat-hook 衣钩
ring black .10 .29 .025 suspender 背带环
hook black .035 .065 .048 torch-clip 手电夹
#洗消 floor
bin olive .56 .79 .50 dirty-bin 污装桶
bag cloth .44 .64 .39 laundry-bag 污衣袋
shelf steel .50 .78 .44 bag-rack 袋架
trolley blue .57 .84 .77 laundry-cart 洗衣周转车
folded gray .75 .025 .47 wash-mat 吸水垫
machine steel .88 1.15 .95 extractor-washer 工业洗脱机
cab steel .91 1.90 .72 drying-cabinet 装备烘干柜
sink steel .80 .64 .62 deep-sink 深洗槽
table steel 1.20 .88 .69 drain-table 沥水台
tray blue .49 .23 .36 disinfect-tray 消毒筐
shelf steel 1.10 1.60 .49 drying-rack 晾架
bottle white .21 .38 .15 detergent 洗剂桶
#洗消 shelf
tool rubber .08 .23 .065 scrub-brush 刷具
folded green .4 .055 .34 apron 围裙
folded blue .13 .05 .29 wash-gloves 厚手套
bin paper .23 .12 .09 glove-box 手套盒
glass glass .18 .08 .08 goggles 护目镜
glass glass .23 .24 .13 face-shield 面屏
sign amber .12 .08 .002 pending-tag 待处理签
sign white .1 .13 .002 chemical-label 洗剂标签
#洗消 wall
clock white .28 .28 .065 wet-clock 防水钟
sink green .36 .15 .35 eyewash 洗眼盆
tool steel .08 .20 .045 spray 冲洗喷头
#水带与维修 floor
shelf steel 1.6 1.65 .67 hose-rack 水带架
reel cloth .17 .48 .48 rolled-hose 卷带
folded cloth .75 .24 .20 packed-hose 折叠水带
trolley iron .61 .90 1.03 utility-cart 搬运车
reel red .51 .70 .70 winder 收卷器
pipe steel 1.4 .04 .04 drying-bar 晾杆
table iron 1.8 .90 .80 workbench 工作台
cab red .69 .84 .49 toolbox-cart 工具柜
shelf iron 1.3 1.9 .55 parts-rack 备件架
bin iron .37 .54 .37 scrap-bin 废件桶
#水带与维修 bench
pipe brass .11 .10 .10 coupling 水带接口
disk brass .095 .095 .035 hose-cap 接口盖
pipe iron .32 .10 .10 nozzle 喷嘴
ring cloth .18 .14 .04 tie 绑带
sign paper .085 .045 .003 hose-id 编号签
tool iron .075 .28 .026 spanner 接头扳手
tool iron .041 .19 .017 wrench 组合扳手
tool red .035 .19 .035 screwdriver 螺丝刀
tray iron .34 .055 .19 parts-pan 零件盘
bin black .27 .065 .18 sockets 套筒盒
cab olive .43 .32 .20 parts-drawers 紧固件抽屉柜
tray blue .17 .042 .12 seal-box 密封圈盒
folded blue .27 .04 .21 rag 擦布
sign paper .21 .29 .002 job-card 维修单
bin blue .46 .28 .32 tote 周转箱
slab oak .42 .34 .35 carton 纸箱
sign paper .12 .05 .002 parts-label 备件签
#水带与维修 wall
grid iron 1.2 .65 .045 pegboard 工具挂板
hook iron .035 .048 .09 peg-hook 挂板钩
#呼吸与急救 floor
air gray .18 .62 .18 cylinder 呼吸器气瓶
trolley olive .51 1.1 .65 cylinder-cart 气瓶车
cab steel .88 1.34 .68 fill-cabinet 充装柜
machine iron .87 .81 .65 compressor 空压机外壳
shelf olive .74 1.50 .41 mask-cubby 面罩格架
bag red .53 .33 .31 ems-bag 急救包
trolley amber .60 .87 1.94 stretcher-cart 担架车
folded cloth .55 .16 1.0 folding-stretcher 折叠担架
bin white .53 .65 .44 waste-bin 医废桶
bin red .21 .27 .16 sharps 锐器盒
#呼吸与急救 shelf
bag black .34 .57 .18 harness 呼吸器背架
ring black .10 .36 .04 shoulder-strap 肩带
ring rubber .30 .12 .04 belt 腰带
helmet black .19 .24 .19 facepiece 呼吸面罩
disk iron .075 .075 .055 regulator 调节器
tray black .20 .11 .24 bottle-cradle 瓶托
ring olive .18 .18 .035 strap 气瓶固定带
sign paper .075 .10 .002 inspection 气瓶检验签
screen black .29 .23 .16 monitor 急救监护仪
bin red .31 .26 .12 aed 除颤器箱
folded cloth .20 .07 .15 dressing 敷料包
bin blue .35 .18 .23 medical-box 密封补给箱
bin paper .19 .11 .10 masks 口罩盒
ring white .23 .14 .20 collar 颈托
slab blue .13 .035 .43 splint 夹板
#公共前厅 floor
chair blue .58 .82 .57 waiting-chair 等候椅
glass glass 1.3 .88 .16 reception-window 接待窗
shelf oak .68 1.12 .29 literature 宣传册架
cab oak .89 1.65 .46 display-case 展示柜
sink steel .46 .76 .4 fountain 饮水器
bin gray .31 .54 .31 trash 垃圾桶
#公共前厅 wall
panel oak 1.20 .81 .055 bulletin 公告栏
sign paper .42 .59 .003 poster 社区海报
disk brass .34 .34 .025 crest 站徽
panel brass .39 .26 .025 plaque 纪念铭牌
panel oak .34 .27 .03 photo 历史照片框
clock white .31 .31 .045 clock 壁钟
#值班行政 desk
book olive .28 .027 .21 visitor-log 访客簿
disk brass .087 .087 .065 bell 访客铃
can iron .076 .10 .076 pen-cup 笔筒
screen black .53 .38 .17 display 显示器
slab black .43 .025 .16 keyboard 键盘
cloth black .063 .038 .11 mouse 鼠标
appliance gray .43 .25 .38 printer 打印机
panel black .22 .075 .19 telephone 电话
bin black .16 .08 .11 charger 充电座
appliance black .27 .105 .19 radio 电台
tool black .057 .13 .037 mic 手咪
ring black .17 .19 .07 headset 耳机
tray black .25 .037 .17 stationery 文具盘
book olive .24 .043 .31 binder 文件夹
book paper .23 .016 .31 duty-log 出勤记录
sign paper .21 .29 .003 roster 交班记录
#值班行政 floor
table oak 1.50 .75 .73 desk 办公桌
chair black .56 .92 .54 office-chair 办公椅
cab olive .49 1.22 .62 files 文件柜
cab gray .44 .61 .52 pedestal 抽屉柜
#值班行政 wall
panel white 1.20 .78 .036 whiteboard 交班板
sign blue .16 .038 .004 magnet 班次磁条
book paper .26 .026 .32 calendar 日历
sign paper .76 .52 .008 map 虚构街区图
#厨房 floor
appliance steel .76 .90 .72 oven 烤箱
appliance steel .90 1.80 .74 fridge 冰箱
appliance white 1.0 .86 .66 freezer 冷冻柜
appliance steel .60 .84 .59 dishwasher 洗碗机
sink steel .80 .31 .54 sink 厨房水槽
table oak 1.65 .91 .78 island 备餐岛
cab olive .81 .90 .60 base-cab 地柜
cab oak .60 1.82 .49 pantry 分班食品柜
shelf steel 1.12 1.78 .46 food-rack 食品架
bin green .41 .76 .43 recycling 回收桶
table oak 2.40 .76 1.02 dining-table 长餐桌
chair oak .46 .88 .48 dining-chair 餐椅
#厨房 wall
cab olive .80 .69 .34 upper-cab 吊柜
grid steel .90 .28 .57 range-hood 排烟罩
grid iron .42 .023 .31 filter 滤网
shelf oak .72 .66 .24 open-shelf 开放搁架
hook steel .16 .30 .21 faucet 龙头
panel black .59 .78 .036 menu 菜单板
sign paper .21 .30 .003 chores 值日表
#厨房 counter
appliance black .51 .29 .40 microwave 微波炉
appliance black .24 .36 .25 coffee 咖啡机
appliance steel .28 .21 .18 toaster 烤面包机
can iron .26 .18 .26 pot 锅
disk steel .27 .27 .034 lid 锅盖
tray iron .42 .028 .29 sheet-pan 烤盘
slab oak .37 .023 .26 cutting-board 砧板
cab oak .15 .24 .12 knife-block 刀座
tray steel .27 .12 .16 cutlery 餐具篮
bottle green .078 .23 .061 dish-soap 洗洁精
folded cloth .25 .03 .21 dishcloth 抹布
bin cloth .29 .23 .19 dry-food 干粮箱
can olive .084 .11 .084 food-can 罐头
bag paper .17 .27 .10 food-bag 食品袋
bottle brass .054 .13 .054 seasoning 调料瓶
sign paper .05 .026 .001 date-label 日期签
bin white .19 .08 .14 lunch-box 餐盒
tray blue .41 .23 .28 drinks 饮料箱
shelf oak .43 .38 .17 mug-rack 杯架
disk white .25 .25 .025 plate 餐盘
tray iron .14 .11 .06 napkins 纸巾座
slab cloth .42 .004 .29 placemat 餐垫
#起居与宿舍 floor
couch blue 2.03 .85 .88 sofa 沙发
couch cloth .88 .94 .89 recliner 躺椅
table oak 1.09 .42 .59 coffee-table 茶几
table oak .46 .54 .43 end-table 边几
screen black 1.12 .68 .23 tv 电视
shelf oak .91 1.71 .32 bookcase 书架
bed blue .99 .61 2.03 bunk 单人床
cab oak .43 .55 .39 nightstand 床头柜
cab olive .52 1.82 .52 wardrobe 个人衣柜
shelf oak .64 .44 .29 shoes 鞋架
bag cloth .36 .53 .32 linen-bag 私人洗衣袋
#起居与宿舍 shelf
book paper .21 .015 .28 magazine 杂志
bin blue .29 .067 .28 game 桌游盒
folded blue .53 .11 .39 blanket 叠毯
panel gray .21 .17 .027 family-photo 私人相框
panel black .053 .17 .02 remote 遥控器
book olive .16 .039 .23 book 书
cloth white .63 .13 .39 pillow 枕头
folded white .46 .058 .34 sheets 床单
folded blue .40 .076 .32 uniform 制服
clock black .13 .12 .052 alarm-clock 闹钟
bin green .066 .036 .045 earplug-case 耳塞盒
#卫浴 floor
sink white .57 .20 .46 basin 洗手盆
slab gray .99 1.79 .04 partition 隔断
slab rubber .66 .015 .4 bath-mat 防滑垫
bin steel .22 .29 .22 bath-bin 卫生桶
#卫浴 wall
glass glass .57 .68 .12 mirror-cab 镜面柜
bottle white .11 .23 .09 soap 皂液器
bin white .29 .34 .11 towels 擦手纸盒
reel white .13 .14 .14 toilet-roll 卷纸器
disk steel .13 .13 .06 shower-head 淋浴头
disk steel .09 .09 .055 mixer 混水阀
slab white .94 1.82 .03 shower-curtain 浴帘
ring white .044 .063 .01 curtain-ring 浴帘环
hook iron .052 .085 .064 towel-hook 毛巾钩
tray tile .28 .23 .13 niche 置物格
grid iron .15 .023 .15 bath-drain 排水格栅
#后勤 floor
machine white .61 .89 .64 washer 家用洗衣机
machine gray .62 .89 .65 dryer 烘干机
table white 1.1 .89 .63 laundry-table 叠衣台
tray cloth .56 .39 .38 basket 洗衣筐
shelf white .92 1.52 .42 linen-rack 织物架
sink gray .62 .39 .62 mop-sink 拖布池
trolley amber .43 .76 .56 wringer 挤水车
tool cloth .31 1.36 .12 mop 拖把
tool cloth .35 1.25 .09 broom 扫把
tray gray .28 .09 .28 dustpan 簸箕
trolley green .56 .97 .89 janitor-cart 清洁推车
shelf gray .89 1.56 .45 supply-rack 耗材架
sign amber .31 .61 .21 wet-sign 湿地警示牌
#灾后叙事 wall
slab white 2.4 3 .13 intact-wall 整墙段
duct iron .09 2.7 .054 exposed-stud 外露墙骨
trim gray 1.0 .071 .021 loose-base 脱落踢脚
sign paper .12 .055 .001 faded-label 褪色标签
sign gray .078 .035 .001 glue 残胶
sign paper .21 .29 .002 incomplete-form 未完检验单
#扩展 floor
shelf iron 1.25 .83 .53 dumbbell-rack 哑铃架
table black 1.17 .49 .31 gym-bench 训练凳
slab rubber 1.8 .015 .65 exercise-mat 地垫
table gray 1.8 .74 .63 folding-table 折叠桌
chair gray .45 .80 .47 folding-chair 折椅
trolley iron .61 1.08 .92 chair-cart 叠椅车
cab oak .62 1.12 .48 lectern 讲台
tube brass .09 3.2 .09 pole 消防滑杆
shelf red 1.5 1.8 .66 marine-rack 水域器材架
#扩展 wall
panel white 1.8 1.1 .08 projector-screen 投影幕
`;
for(const line of catalog.trim().split('\n')){
 const [type,material,w,h,d,id,label]=line.trim().split(/\s+/);
 if(type[0]==='#'){group=type.slice(1);host=material;continue;}
 batch(group,type,material,[+w,+h,+d],id+':'+label,host);
}
