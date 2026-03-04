import { Sequelize } from 'sequelize'

import { config } from '../../config.js'

let sequelize

export const getSequelize = () => {
  if (!sequelize) {
    const { host, port, database, username, password } = config.get('db')

    sequelize = new Sequelize(database, username, password, {
      host,
      port,
      dialect: 'postgres',
      logging: false
    })
  }

  return sequelize
}

export const syncDatabase = async () => {
  const instance = getSequelize()
  await instance.authenticate()
  await instance.sync()
}
