// 数据库初始化云函数
// 首次使用时调用，确保所有集合已创建
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  const collections = ['users', 'goods', 'messages']
  const results = {}

  for (const name of collections) {
    try {
      // 写入一条测试数据触发集合创建
      const addRes = await db.collection(name).add({
        data: {
          _init: true,
          createTime: db.serverDate()
        }
      })
      // 立即删除测试数据
      await db.collection(name).doc(addRes._id).remove()
      results[name] = '已就绪'
    } catch (err) {
      // 如果集合已存在（errCode -502005），也算成功
      if (err.errCode === -502005 || err.errCode === -502001) {
        results[name] = '已存在'
      } else {
        results[name] = `失败: ${err.errMsg || err.message}`
      }
    }
  }

  // 设置 users 集合的权限：仅创建者可读写
  // （需要在微信开发者工具中手动设置，这里仅做记录）

  return {
    msg: '数据库初始化完成',
    collections: results
  }
}
