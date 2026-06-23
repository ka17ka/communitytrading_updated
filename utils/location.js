// 计算两点之间的距离（单位：米）
const calcDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  const distance = R * c
  return distance
}

// 把距离格式化成显示文字
const formatDistance = (meters) => {
  if (meters < 1000) {
    return Math.round(meters) + 'm'
  } else {
    return (meters / 1000).toFixed(1) + 'km'
  }
}

module.exports = {
  calcDistance,
  formatDistance
}