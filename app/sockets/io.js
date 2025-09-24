let ioInstance;

module.exports = {
  init(io) {
    ioInstance = io;
  },
  getIO() {
    if (!ioInstance) {
      throw new Error('Socket.io has not been initialised');
    }
    return ioInstance;
  }
};
