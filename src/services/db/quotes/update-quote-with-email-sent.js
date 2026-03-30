export const dbUpdateQuoteWithEmailSent = async ({ db, reference, data }) => {
  const { emailSendRequestAt } = data
  await db.query(
    'UPDATE quotes SET email_send_request_at = $1 WHERE reference = $2',
    [emailSendRequestAt, reference]
  )
}
