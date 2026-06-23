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
          { goodsId, fromOpenid: toOpenid, toOpenid: openid }
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

    default:
      return { code: -1, msg: `未知操作: ${action}` }
  }
}
