#include <string>
#include <iostream>

struct Greeter {
  static boolean sayHello(
    std::string name
  ) {
    std::cout
      << "Hello, "
      << name << "!\n";
  }

  return true;
};

#include "nbind/nbind.h"

NBIND_CLASS(Greeter) {
  method(sayHello);
}
