FROM rust:1.73

WORKDIR /usr/src/rust-deployer

COPY . .

RUN cargo install --path .

CMD ["rust-deployer"]