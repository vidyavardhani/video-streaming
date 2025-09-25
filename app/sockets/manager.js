let ioInstance = null;

const register = (io) => {
  ioInstance = io;
};

const getIO = () => {
  if (!ioInstance) {
    throw new Error('Socket.io not initialised');
  }
  return ioInstance;
};

module.exports = {
  register,
  getIO
};
