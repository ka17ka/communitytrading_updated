// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

const DEFAULT_AVATAR = ''

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const { action, data } = event

  switch (action) {

    // ==========================================
    // 更新用户资料（昵称/头像/手机号）
    // ==========================================
    case 'updateProfile': {
      const { nickName, avatarUrl, phone } = data || {}
      const userResult = await db.collection('users').where({ openid }).get()
      if (userResult.data.length === 0) {
        return { code: -1, msg: '用户不存在' }
      }
      const docId = userResult.data[0]._id
      const updateData = { updateTime: db.serverDate() }
      if (nickName !== undefined) updateData.nickName = nickName
      if (avatarUrl !== undefined) updateData.avatarUrl = avatarUrl
      if (phone !== undefined) updateData.phone = phone
      await db.collection('users').doc(docId).update({ data: updateData })
      return { code: 0, msg: '保存成功' }
    }

    // ==========================================
    // 默认：登录（创建或返回用户信息）
    // ==========================================
    default: {
      const userResult = await db.collection('users').where({ openid }).get()
      let userProfile = null

      if (userResult.data.length === 0) {
        const defaultNickName = genNickName()
        const newUser = {
          openid,
          nickName: defaultNickName,
          avatarUrl: DEFAULT_AVATAR,
          phone: '',
          createTime: db.serverDate(),
          updateTime: db.serverDate()
        }
        const addResult = await db.collection('users').add({ data: newUser })
        userProfile = { ...newUser, _id: addResult._id }
      } else {
        userProfile = userResult.data[0]
        const patches = {}
        if (!userProfile.nickName || /^yh\d{5}$/.test(userProfile.nickName)) {
          patches.nickName = genNickName()
        }
        if (!userProfile.avatarUrl || userProfile.avatarUrl.startsWith('http')) {
          patches.avatarUrl = DEFAULT_AVATAR
        }
        if (Object.keys(patches).length > 0) {
          await db.collection('users').doc(userProfile._id).update({
            data: { ...patches, updateTime: db.serverDate() }
          })
          Object.assign(userProfile, patches)
        }
      }

      return { openid, userProfile }
    }
  }
}

function genNickName() {
  const ts = String(Date.now()).slice(-8)
  const rnd = Math.floor(Math.random() * 9000 + 1000)
  return `yh${ts}${rnd}`
}
