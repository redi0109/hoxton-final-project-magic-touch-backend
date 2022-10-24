import express from "express";
import cors from "cors";
import { PrismaClient } from "@prisma/client";
import { generateToken, getCurrentUser, hash, verify } from "../src/utils";

const app = express();
const prisma = new PrismaClient();

app.use(cors());
app.use(express.json());

const port = 5000;

app.get("/", (req, res) => {
  res.send(`
    <h2>Available resources:</h2>
    <ul>
      <li><a href="/products">Products</a></li>
      <li><a href="/products/id">Product by id </a></li>
      <li><a href="/brands">Brands</a></li>
      <li><a href="/brands/id">Brand by id </a></li>
      <li><a href="/categories/">Categories</a></li>
    </ul>`);
});

app.get("/products", async (req, res) => {
  try {
    const products = await prisma.product.findMany({
      include: {
        categories: true,
        cartItem: { include: { product: { include: { brand: true } } } },
        boughtProduct: { include: { product: { include: { brand: true } } } },
        brand: true,
      },
    });
    res.send(products);
  } catch (error) {
    //@ts-ignore
    res.status(400).send({ errors: [error.message] });
  }
});

app.get("/productByCategory/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) {
      res.status(400).send({ errors: ["Category id not provided"] });
      return;
    }
    const category = await prisma.category.findUnique({
      where: { id },
      include: { products: true },
    });
    if (!category) {
      res.status(404).send({ errors: ["Category not found"] });
      return;
    }
    res.send(category.products);
  } catch (error) {
    //@ts-ignore
    res.status(400).send({ errors: [error.message] });
  }
});

app.get("/productsByBrand/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) {
      res.status(400).send({ errors: ["Brand id not provided"] });
      return;
    }
    const brand = await prisma.brand.findUnique({
      where: { id },
      include: { product: true },
    });
    if (!brand) {
      res.status(404).send({ errors: ["Brand not found"] });
      return;
    }
    res.send(brand.product);
  } catch (error) {
    //@ts-ignore
    res.status(400).send({ errors: [error.message] });
  }
});

app.get("/products/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);

    const product = await prisma.product.findUnique({
      where: { id },
      include: { brand: true, categories: true },
    });
    if (product) {
      res.send(product);
    } else {
      res.status(400).send({ errors: ["Product not found"] });
    }
  } catch (error) {
    //@ts-ignore
    res.status(400).send({ errors: [error.message] });
  }
});

app.get("/brands/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);

    const brand = await prisma.brand.findUnique({
      where: { id },
      include: { product: true },
    });
    if (brand) {
      res.send(brand);
    } else {
      res.status(400).send({ errors: ["Brand not found"] });
    }
  } catch (error) {
    //@ts-ignore
    res.status(400).send({ errors: [error.message] });
  }
});

app.get("/categories", async (req, res) => {
  try {
    const categories = await prisma.category.findMany({
      include: { products: true },
    });
    res.send(categories);
  } catch (error) {
    //@ts-ignore
    res.status(400).send({ errors: [error.message] });
  }
});

app.get("/categories/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);

    const category = await prisma.category.findUnique({
      where: { id },
      include: { products: true },
    });
    if (category) {
      res.send(category);
    } else {
      res.status(400).send({ errors: ["Category not found"] });
    }
  } catch (error) {
    //@ts-ignore
    res.status(400).send({ errors: [error.message] });
  }
});

app.get("/brands", async (req, res) => {
  try {
    const brands = await prisma.brand.findMany({ include: { product: true } });
    res.send(brands);
  } catch (error) {
    //@ts-ignore
    res.status(400).send({ errors: [error.message] });
  }
});

app.get("/users", async (req, res) => {
  const users = await prisma.user.findMany({
    include: { cart: true, boughtProduct: true },
  });
  res.send(users);
});

app.post("/cartItem", async (req, res) => {
  try {
    const token = req.headers.authorization;

    if (!token) {
      res.status(401).send({ errors: ["No token provided."] });
      return;
    }
    const user = await getCurrentUser(token);
    if (!user) {
      res.status(401).send({ errors: ["Invalid token provided."] });
      return;
    }
    const data = {
      userId: user.id,
      productId: req.body.productId,
      quantity: req.body.quantity,
    };

    let errors: string[] = [];
    const product = await prisma.product.findUnique({
      where: { id: Number(data.productId) },
    });

    if (!product) {
      res.status(404).send({ errors: ["Product not found"] });
      return;
    }
    if (Number(product.inStock) < Number(data.quantity)) {
      errors.push("Not enough products in stock");
    } else {
      await prisma.product.update({
        where: { id: Number(data.productId) },
        data: { inStock: product.inStock - Number(data.quantity) },
      });
    }
    if (product.inStock < 0) {
      await prisma.product.update({
        where: { id: data.productId },
        data: { inStock: 0 },
      });
    }

    if (typeof data.userId !== "number") {
      errors.push("UserId not provided or not a number");
    }
    if (typeof data.productId !== "number") {
      errors.push("productId not provided or not a number");
      return;
    }
    if (data.quantity && typeof data.quantity !== "number") {
      errors.push("Quantity provided is not a number");
    }

    if (errors.length === 0) {
      const cartItem = await prisma.cartItem.create({
        data: {
          userId: data.userId,
          productId: data.productId,
          quantity: data.quantity,
        },
        include: { product: { include: { brand: true } } },
      });

      res.send(cartItem);
    } else {
      res.status(400).send({ errors });
    }
  } catch (error) {
    //@ts-ignore
    res.status(400).send({ errors: [error.message] });
  }
});

app.get("/cartItems", async (req, res) => {
  try {
    const token = req.headers.authorization;
    if (!token) {
      res.status(404).send({ errors: ["Token not found"] });
      return;
    }
    const user = await getCurrentUser(token);
    if (!user) {
      res.status(404).send({ errors: ["Invalid token"] });
      return;
    }
    res.send(user.cart);
  } catch (error) {
    //@ts-ignore
    res.status(400).send({ errors: [error.message] });
  }
});

app.delete("/cartItem/:id", async (req, res) => {
  try {
    const token = req.headers.authorization;
    if (!token) {
      res.status(404).send({ errors: ["Token not found"] });
      return;
    }
    const user = await getCurrentUser(token);
    if (!user) {
      res.status(404).send({ errors: ["Invalid token provided"] });
      return;
    }
    const id = Number(req.params.id);
    if (!id) {
      res
        .status(400)
        .send({ errors: ["CartItem with this id does not exist"] });
      return;
    }
    const cartItem = await prisma.cartItem.delete({
      where: { id },
      include: { product: true },
    });
    if (!cartItem) {
      res.status(404).send({ errors: ["Cart item not found"] });
      return;
    }
    await prisma.product.update({
      where: { id: cartItem.productId },
      data: {
        inStock: cartItem.product.inStock + cartItem.quantity,
      },
    });
    res.send(user.cart);
  } catch (error) {
    //@ts-ignore
    res.status(400).send({ errors: [error.message] });
  }
});

app.post("/buy", async (req, res) => {
  try {
    const token = req.headers.authorization;
    if (token) {
      const user = await getCurrentUser(token);
      if (!user) {
        res.status(400).send({ errors: ["Invalid token"] });
      } else {
        let total = 0;
        for (let item of user.cart) {
          total += item.product.price * item.quantity;
        }
        if (total < user.balance) {
          for (let item of user.cart) {
            await prisma.boughtProduct.create({
              data: {
                userId: item.userId,
                productId: item.productId,
              },
            });

            await prisma.cartItem.delete({ where: { id: item.id } });
          }
          await prisma.user.update({
            where: { id: user.id },
            data: {
              balance: user.balance - total,
            },
          });
          res.send({ message: "Order successful!" });
        } else {
          res.status(400).send({ errors: ["Go find a job!"] });
        }
      }
    } else {
      res.status(400).send({ errors: ["Token not found"] });
    }
  } catch (error) {
    //@ts-ignore
    res.status(400).send({ errors: [error.message] });
  }
});

app.post("/sign-up", async (req, res) => {
  const data = {
    name: req.body.name,
    email: req.body.email,
    password: req.body.email,
  };
  try {
    const errors: string[] = [];

    if (typeof data.name !== "string") {
      errors.push("Name missing or not a string");
    }
    if (typeof data.email !== "string") {
      errors.push("Email missing or not a string");
    }

    if (typeof data.password !== "string") {
      errors.push("Password missing or not a string");
    }

    if (errors.length > 0) {
      res.status(400).send({ errors });
      return;
    }
    const existingUser = await prisma.user.findUnique({
      where: { email: data.email },
    });
    if (existingUser) {
      res.status(400).send({ errors: ["Email already exists."] });
      return;
    }
    const user = await prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        password: hash(data.password),
      },
      include: {
        boughtProduct: { include: { product: { include: { brand: true } } } },
        cart: { include: { product: { include: { brand: true } } } },
      },
    });
    const token = generateToken(user.id);
    res.send({ user, token });
  } catch (error) {
    //@ts-ignore
    res.status(400).send({ errors: [error.message] });
  }
});

app.post("/sign-in", async (req, res) => {
  try {
    const { email, password } = req.body;
    const errors: string[] = [];

    if (typeof email !== "string") {
      errors.push("Email missing or not a string");
    }

    if (typeof password !== "string") {
      errors.push("Password missing or not a string");
    }

    if (errors.length > 0) {
      res.status(400).send({ errors });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        boughtProduct: { include: { product: { include: { brand: true } } } },
        cart: { include: { product: { include: { brand: true } } } },
      },
    });
    console.log({ user });
    if (user && verify(password, user.password)) {
      const token = generateToken(user.id);
      res.send({ user, token });
    } else {
      res.status(400).send({ errors: ["Username or password invalid."] });
    }
  } catch (error) {
    // @ts-ignore
    res.status(400).send({ errors: [error.message] });
  }
});

app.get("/validate", async (req, res) => {
  try {
    const token = req.headers.authorization;
    if (token) {
      const user = await getCurrentUser(token);
      if (user) {
        const newToken = generateToken(user.id);
        res.send({ user, token: newToken });
      } else {
        res.status(400).send({ errors: ["Token invalid"] });
      }
    } else {
      res.status(400).send({ errors: ["Token not provided"] });
    }
  } catch (error) {
    //@ts-ignore
    res.status(400).send({ errors: [error.message] });
  }
});

app.listen(port, () => {
  console.log(`App running: http://localhost:${port}`);
});
