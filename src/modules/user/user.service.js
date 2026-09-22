import User from "./user.model.js";

const userService = {
  async findByEmail(email) {
    return User.findOne({ email: email.toLowerCase().trim() });
  },

  async findById(id) {
    return User.findById(id);
  },

  async findByUsername(username) {
    return User.findOne({ username: username.toLowerCase().trim() });
  },

  async create(data) {
    return User.create(data);
  },

  async updateById(id, data) {
    return User.findByIdAndUpdate(id, data, { new: true });
  },
};

export default userService;
