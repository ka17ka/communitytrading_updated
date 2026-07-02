// 商品云函数 — 处理商品的所有操作
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const { action, data } = event
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID  // 当前操作用户的 openid

  switch (action) {

    // ==========================================
    // 1. 发布商品
    // ==========================================
    case 'publish': {
      const { name, desc, cloudImageIds } = data

      // -- 内容安全检测（文字）--
      const textCheck = await checkContent(cloud, openid, [name, desc].filter(Boolean))
      if (textCheck) return textCheck

      // -- 内容安全检测（图片）--
      const imgCheck = await checkImages(cloud, cloudImageIds || [])
      if (imgCheck) return imgCheck

      const goods = {
        ...data,
        openid,                          // 记录发布者
        status: 'on',                    // 默认上架
        createTime: db.serverDate(),     // 服务器时间，避免客户端时间不准
        updateTime: db.serverDate()
      }
      const result = await db.collection('goods').add({ data: goods })
      return { code: 0, msg: '发布成功', goodsId: result._id }
    }

    // ==========================================
    // 2. 商品列表（支持搜索、分类筛选）
    // ==========================================
    case 'list': {
      const { searchKey, category, pageSize = 20, page = 1, includeMine } = data || {}
      const skip = (page - 1) * pageSize

      // 构建查询条件：上架，正式环境排除自己的商品
      let where = { status: 'on' }
      if (!includeMine) {
        where.openid = _.neq(openid)
      }
      if (category && category !== 0) {
        where.category = category
      }

      // 先查总数
      const countResult = await db.collection('goods').where(where).count()

      // 查询列表（按时间倒序）
      let query = db.collection('goods')
        .where(where)
        .orderBy('createTime', 'desc')
        .skip(skip)
        .limit(pageSize)

      const listResult = await query.get()

      // 如果有关键词搜索，在内存中过滤（云数据库不支持中文模糊搜索）
      // 生产环境建议使用搜索服务或自行分词
      let goodsList = listResult.data
      if (searchKey && searchKey.trim()) {
        const key = searchKey.trim()
        goodsList = goodsList.filter(item =>
          item.name && item.name.includes(key)
        )
      }

      // 关联发布者信息（昵称、头像）
      const openids = [...new Set(goodsList.map(g => g.openid).filter(Boolean))]
      let userMap = {}
      if (openids.length > 0) {
        const userResult = await db.collection('users')
          .where({ openid: _.in(openids) })
          .get()
        userResult.data.forEach(u => {
          userMap[u.openid] = u
        })
      }

      // 拼上发布者信息
      const enrichedList = goodsList.map(goods => ({
        ...goods,
        nickName: (userMap[goods.openid] && userMap[goods.openid].nickName) || '用户',
        avatarUrl: (userMap[goods.openid] && userMap[goods.openid].avatarUrl) || ''
      }))

      return {
        code: 0,
        list: enrichedList,
        total: countResult.total,
        page,
        pageSize
      }
    }

    // ==========================================
    // 3. 商品详情
    // ==========================================
    case 'detail': {
      const { goodsId } = data
      const result = await db.collection('goods').doc(goodsId).get()
      if (!result.data) {
        return { code: -1, msg: '商品不存在' }
      }

      // 获取发布者信息
      const goods = result.data
      // 先设默认值
      goods.nickName = '用户'
      goods.avatarUrl = ''
      if (goods.openid) {
        const userResult = await db.collection('users').where({ openid: goods.openid }).get()
        if (userResult.data.length > 0) {
          goods.nickName = userResult.data[0].nickName || '用户'
          goods.avatarUrl = userResult.data[0].avatarUrl || ''
        }
      }

      // 判断是不是当前用户发布的
      goods.isMine = goods.openid === openid

      return { code: 0, goods }
    }

    // ==========================================
    // 4. 更新商品（编辑）
    // ==========================================
    case 'update': {
      const { goodsId, updateData } = data

      // 先验证商品是不是当前用户的
      const goods = await db.collection('goods').doc(goodsId).get()
      if (!goods.data || goods.data.openid !== openid) {
        return { code: -1, msg: '无权修改此商品' }
      }

      // -- 内容安全检测（文字）--
      const { name, desc, cloudImageIds } = updateData
      const textCheck = await checkContent(cloud, openid, [name, desc].filter(Boolean))
      if (textCheck) return textCheck

      // -- 内容安全检测（图片）--
      if (cloudImageIds) {
        const imgCheck = await checkImages(cloud, cloudImageIds)
        if (imgCheck) return imgCheck
      }

      await db.collection('goods').doc(goodsId).update({
        data: {
          ...updateData,
          updateTime: db.serverDate()
        }
      })

      return { code: 0, msg: '修改成功' }
    }

    // ==========================================
    // 5. 删除商品
    // ==========================================
    case 'delete': {
      const { goodsId } = data

      // 验证权限
      const goods = await db.collection('goods').doc(goodsId).get()
      if (!goods.data || goods.data.openid !== openid) {
        return { code: -1, msg: '无权删除此商品' }
      }

      await db.collection('goods').doc(goodsId).remove()

      return { code: 0, msg: '删除成功' }
    }

    // ==========================================
    // 6. 上下架切换
    // ==========================================
    case 'toggleStatus': {
      const { goodsId } = data

      // 验证权限
      const goods = await db.collection('goods').doc(goodsId).get()
      if (!goods.data || goods.data.openid !== openid) {
        return { code: -1, msg: '无权操作' }
      }

      const newStatus = goods.data.status === 'off' ? 'on' : 'off'
      await db.collection('goods').doc(goodsId).update({
        data: {
          status: newStatus,
          updateTime: db.serverDate()
        }
      })

      return { code: 0, msg: newStatus === 'off' ? '已下架' : '已上架', status: newStatus }
    }

    // ==========================================
    // 7. 我的商品列表
    // ==========================================
    case 'myList': {
      const result = await db.collection('goods')
        .where({ openid })
        .orderBy('createTime', 'desc')
        .get()

      return { code: 0, list: result.data }
    }

    default:
      return { code: -1, msg: `未知操作: ${action}` }
  }
}

// ==========================================
// 内容安全检测 — 文字
// ==========================================
async function checkContent(cloud, openid, texts) {
  for (const text of texts) {
    if (!text || !text.trim()) continue
    try {
      const res = await cloud.openapi.security.msgSecCheck({
        content: text,
        openid
      })
      if (res.result.suggest !== 'pass') {
        return { code: -1, msg: '内容含有违规信息，请修改后重试' }
      }
    } catch (e) {
      if (e && e.errCode === 87014) {
        return { code: -1, msg: '内容含有违规信息，请修改后重试' }
      }
      console.error('文字安全检测失败:', JSON.stringify(e))
    }
  }
  return null
}

// ==========================================
// 内容安全检测 — 图片
// ==========================================
async function checkImages(cloud, fileIDs) {
  if (!fileIDs || fileIDs.length === 0) return null
  for (const fileID of fileIDs) {
    if (!fileID) continue
    try {
      // 从云存储下载图片 Buffer
      const download = await cloud.downloadFile({ fileID })
      const res = await cloud.openapi.security.imgSecCheck({
        media: {
          contentType: 'image/jpeg',
          value: download.fileContent
        }
      })
      if (res.result.suggest !== 'pass') {
        return { code: -1, msg: '图片含有违规内容，请更换后重试' }
      }
    } catch (e) {
      if (e && e.errCode === 87014) {
        return { code: -1, msg: '图片含有违规内容，请更换后重试' }
      }
      console.error('图片安全检测失败:', JSON.stringify(e))
    }
  }
  return null
}
