export class ChannelNotFoundException extends Error {
  constructor(message = 'Marketing channel not found') {
    super(message);
    this.name = 'ChannelNotFoundException';
  }
}
