import { DataTypes } from 'sequelize'

import { getSequelize } from '../sequelize.js'

const sequelize = getSequelize()

const Boundary = sequelize.define('Boundary', {
  id: {
    type: DataTypes.STRING,
    primaryKey: true
  },
  geometry: {
    type: DataTypes.GEOMETRY('GEOMETRY', 4326)
  }
})

export { Boundary }
