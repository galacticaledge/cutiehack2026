{
  description = "Development shell for Socra";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = { nixpkgs, ... }: {
    devShells =
      nixpkgs.lib.genAttrs
        [
          "x86_64-linux"
          "aarch64-linux"
          "aarch64-darwin"
        ]
        (
          system:
          let
            pkgs = nixpkgs.legacyPackages.${system};
          in
          {
            default = pkgs.mkShell {
              packages = with pkgs; [
                cargo
                clippy
                rustc
                rustfmt
                nodejs_22
                postgresql_17
                pkg-config
                act
              ];

              buildInputs = [ pkgs.openssl ];
            };
          }
        );
  };
}
