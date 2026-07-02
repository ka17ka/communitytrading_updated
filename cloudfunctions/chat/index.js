// 聊天云函数 — 消息的发送、列表、会话
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const { action, data } = event
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  switch (action) {

    // ==========================================
    // 1. 发送消息
    // ==========================================
    case 'send': {
      const { goodsId, goodsName, toOpenid, content, type } = data
      const msgType = type || 'text'

      // -- 内容安全检测 --
      if (msgType === 'text') {
        const textCheck = await checkContent(cloud, openid, [content])
        if (textCheck) return textCheck
      } else if (msgType === 'image') {
        const imgCheck = await checkImages(cloud, [content])
        if (imgCheck) return imgCheck
      }

      const message = {
        goodsId,
        goodsName,
        fromOpenid: openid,          // 发送者
        toOpenid,                     // 接收者
        content,
        type: type || 'text',        // text 或 image
        isRead: false,
        createTime: db.serverDate()
      }
      await db.collection('messages').add({ data: message })
      return { code: 0, msg: '发送成功' }
    }

    // ==========================================
    // 2. 获取某个会话的消息列表
    // ==========================================
    case 'getMessages': {
      const { goodsId, toOpenid } = data

      const result = await db.collection('messages')
        .where(_.or([
          { goodsId, fromOpenid: openid, toOpenid },
          { goodsId, fromOpenid: toOpenid, toOpenid: openid },
          { goodsId, fromOpenid: openid, toOpenid: openid }   // 自己发给自己的系统消息
        ]))
        .orderBy('createTime', 'asc')
        .get()

      // 标记已读
      const unreadIds = result.data
        .filter(m => m.toOpenid === openid && !m.isRead)
        .map(m => m._id)
      if (unreadIds.length > 0) {
        for (const id of unreadIds) {
          await db.collection('messages').doc(id).update({
            data: { isRead: true }
          })
        }
      }

      // 查双方头像
      const oids = [openid, toOpenid].filter(Boolean)
      let avatarMap = {}
      if (oids.length > 0) {
        const userRes = await db.collection('users').where({ openid: _.in(oids) }).get()
        userRes.data.forEach(u => { avatarMap[u.openid] = u.avatarUrl || '' })
      }

      return {
        code: 0,
        list: result.data.map(m => ({
          ...m,
          isSelf: m.fromOpenid === openid,
          avatarUrl: avatarMap[m.fromOpenid] || ''
        }))
      }
    }

    // ==========================================
    // 3. 获取我的会话列表
    // ==========================================
    case 'getConversations': {
      // 查询与我相关的所有消息
      const result = await db.collection('messages')
        .where(_.or([
          { fromOpenid: openid },
          { toOpenid: openid }
        ]))
        .orderBy('createTime', 'desc')
        .limit(200)
        .get()

      // 按 goodsId + 对方 openid 分组，取每个会话的最新一条
      const convMap = {}
      result.data.forEach(msg => {
        const otherOpenid = msg.fromOpenid === openid ? msg.toOpenid : msg.fromOpenid
        const convKey = `${msg.goodsId}_${otherOpenid}`
        if (!convMap[convKey]) {
          convMap[convKey] = {
            goodsId: msg.goodsId,
            goodsName: msg.goodsName,
            otherOpenid,
            lastMsg: msg.content,
            lastTime: msg.createTime,
            unreadCount: 0
          }
        }
        if (msg.toOpenid === openid && !msg.isRead) {
          convMap[convKey].unreadCount++
        }
      })

      // 查所有对方用户信息
      const convList = Object.values(convMap)
      const otherOpenids = [...new Set(convList.map(c => c.otherOpenid).filter(Boolean))]
      let userMap = {}
      if (otherOpenids.length > 0) {
        const userResult = await db.collection('users')
          .where({ openid: _.in(otherOpenids) })
          .get()
        userResult.data.forEach(u => {
          userMap[u.openid] = u
        })
      }

      // 拼上用户信息，按时间倒序
      const enriched = convList.map(c => ({
        ...c,
        nickName: (userMap[c.otherOpenid] && userMap[c.otherOpenid].nickName) || '用户',
        avatarUrl: (userMap[c.otherOpenid] && userMap[c.otherOpenid].avatarUrl) || ''
      })).sort((a, b) => new Date(b.lastTime) - new Date(a.lastTime))

      // 总未读数
      const totalUnread = enriched.reduce((sum, c) => sum + c.unreadCount, 0)

      return { code: 0, list: enriched, totalUnread }
    }

    // ==========================================
    // 4. 获取总未读消息数（tab 红点用）
    // ==========================================
    case 'getUnreadCount': {
      const result = await db.collection('messages')
        .where({ toOpenid: openid, isRead: false })
        .count()
      return { code: 0, count: result.total }
    }

    // ==========================================
    // 5. 查询交换联系方式状态
    // ==========================================
    case 'getSwapStatus': {
      const { goodsId, toOpenid } = data

      // 查双方手机号
      const [fromUser, toUser] = await Promise.all([
        db.collection('users').where({ openid }).get(),
        db.collection('users').where({ openid: toOpenid }).get()
      ])
      const myPhone = fromUser.data[0]?.phone || ''
      const otherPhone = toUser.data[0]?.phone || ''

      // 查是否有交换记录（集合可能尚未创建，捕获异常后降级）
      let req = { data: [] }
      try {
        req = await db.collection('swap_requests')
          .where(_.and([
            { goodsId },
            _.or([
              { fromOpenid: openid, toOpenid },
              { fromOpenid: toOpenid, toOpenid: openid }
            ])
          ]))
          .orderBy('createTime', 'desc')
          .limit(1)
          .get()
      } catch (e) {
        // 集合不存在 = 尚无任何交换记录，返回 none 即可
      }

      if (!req.data.length) {
        return { code: 0, status: 'none', hasMyPhone: !!myPhone, hasOtherPhone: !!otherPhone }
      }

      const swap = req.data[0]
      if (swap.status === 'agreed') {
        return {
          code: 0, status: 'agreed',
          otherPhone, myPhone,
          isRequester: swap.fromOpenid === openid
        }
      }

      if (swap.status === 'pending') {
        return {
          code: 0, status: 'pending',
          isRequester: swap.fromOpenid === openid,
          hasMyPhone: !!myPhone, hasOtherPhone: !!otherPhone
        }
      }

      // rejected
      return {
        code: 0, status: 'rejected',
        isRequester: swap.fromOpenid === openid,
        hasMyPhone: !!myPhone, hasOtherPhone: !!otherPhone
      }
    }

    // ==========================================
    // 6. 发起交换联系方式请求
    // ==========================================
    case 'swapContact': {
      const { goodsId, goodsName, toOpenid } = data

      // 1) 检查 A 是否填写了手机号
      const fromUser = await db.collection('users').where({ openid }).get()
      if (!fromUser.data.length || !fromUser.data[0].phone) {
        return { code: -1, msg: '您暂未填写联系方式，请到个人中心完成填写' }
      }

      // 2) 检查 B 是否填写了手机号
      const toUser = await db.collection('users').where({ openid: toOpenid }).get()
      if (!toUser.data.length || !toUser.data[0].phone) {
        return { code: -1, msg: '对方暂未公开联系方式' }
      }

      // 3) 检查是否有待处理的请求（集合可能尚未创建）
      let existing = { data: [] }
      try {
        existing = await db.collection('swap_requests').where(_.and([
          { goodsId },
          _.or([
            { fromOpenid: openid, toOpenid, status: 'pending' },
            { fromOpenid: toOpenid, toOpenid: openid, status: 'pending' }
          ])
        ])).get()
      } catch (e) {
        // 集合不存在，等同无待处理请求
      }
      if (existing.data.length > 0) {
        const isMine = existing.data[0].fromOpenid === openid
        return { code: -1, msg: isMine ? '交换请求已发送，请等待对方回应' : '对方已向您发起了交换请求，请先处理' }
      }

      // 4) 确保集合存在，然后创建交换请求
      try { await db.createCollection('swap_requests') } catch (e) { /* 已存在则忽略 */ }
      await db.collection('swap_requests').add({
        data: {
          fromOpenid: openid,
          toOpenid,
          goodsId,
          status: 'pending',
          createTime: db.serverDate(),
          updateTime: db.serverDate()
        }
      })

      // 5) 发送系统消息
      const sysBase = { goodsId, goodsName: goodsName || '', type: 'system', isRead: false, createTime: db.serverDate() }
      await db.collection('messages').add({
        data: { ...sysBase, fromOpenid: openid, toOpenid: openid, content: '您发起了交换联系方式请求' }
      })
      await db.collection('messages').add({
        data: { ...sysBase, fromOpenid: openid, toOpenid, content: '对方请求交换联系方式' }
      })

      return { code: 0, msg: '请求已发送' }
    }

    // ==========================================
    // 7. 回应交换联系方式请求（同意 / 拒绝）
    // ==========================================
    case 'respondSwap': {
      const { goodsId, fromOpenid: requesterOpenid } = data
      const agree = data.agree === true || data.agree === 'true'

      // 查找待处理请求
      const req = await db.collection('swap_requests').where({
        fromOpenid: requesterOpenid,
        toOpenid: openid,
        goodsId,
        status: 'pending'
      }).get()

      if (!req.data.length) {
        return { code: -1, msg: '请求不存在或已处理' }
      }

      const sysBase = { goodsId, type: 'system', isRead: false, createTime: db.serverDate() }

      if (agree) {
        // 获取双方手机号
        const [fromUser, toUser] = await Promise.all([
          db.collection('users').where({ openid: requesterOpenid }).get(),
          db.collection('users').where({ openid }).get()
        ])
        const fromPhone = fromUser.data[0]?.phone || ''
        const toPhone = toUser.data[0]?.phone || ''

        // 更新请求状态
        await db.collection('swap_requests').doc(req.data[0]._id).update({
          data: { status: 'agreed', updateTime: db.serverDate() }
        })

        // 给请求方 A 发 B 的手机号
        await db.collection('messages').add({
          data: { ...sysBase, fromOpenid: openid, toOpenid: requesterOpenid, content: `已交换联系方式，对方手机号：${toPhone}` }
        })
        // 给回应方 B 发 A 的手机号
        await db.collection('messages').add({
          data: { ...sysBase, fromOpenid: openid, toOpenid: openid, content: `已交换联系方式，对方手机号：${fromPhone}` }
        })

        return { code: 0, msg: '交换成功', otherPhone: fromPhone }
      } else {
        // 拒绝
        await db.collection('swap_requests').doc(req.data[0]._id).update({
          data: { status: 'rejected', updateTime: db.serverDate() }
        })

        // 通知 A
        await db.collection('messages').add({
          data: { ...sysBase, fromOpenid: openid, toOpenid: requesterOpenid, content: '对方暂未公开联系方式' }
        })

        return { code: 0, msg: '已拒绝' }
      }
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
        return { code: -1, msg: '消息含有违规内容，请修改后重试' }
      }
    } catch (e) {
      // errCode 87014 = 内容违规，应拦截而非放行
      if (e && e.errCode === 87014) {
        return { code: -1, msg: '消息含有违规内容，请修改后重试' }
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
